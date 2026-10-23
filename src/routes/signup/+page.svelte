<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { sendEmailVerification, signInWithEmailAndPassword, signOut } from 'firebase/auth';
	import type { SubmitFunction } from '@sveltejs/kit';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import { auth } from '$lib/firebase';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let busy = $state(false);
	let createdEmail = $state<string | null>(null);
	let emailFailed = $state(false);

	const messages = {
		'not-invited': (email: string) =>
			`This app is invite-only. ${email} is not on the invite list. Ask the person who invited you to add your address, then try again.`,
		'weak-password': () => 'Choose a password with at least 8 characters.',
		exists: () => 'An account already exists for that email. Sign in, or reset your password.',
		error: () => 'Something went wrong creating your account. Try again.'
	};

	const message = $derived(
		form && 'reason' in form && form.reason
			? messages[form.reason](form.email ?? 'That email')
			: null
	);

	const submit: SubmitFunction = ({ formData }) => {
		busy = true;
		const email = String(formData.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(formData.get('password') ?? '');

		return async ({ result, update }) => {
			if (result.type === 'success') {
				createdEmail = email;
				try {
					// Firebase sends the verification email on behalf of the signed-in user.
					const credential = await signInWithEmailAndPassword(auth, email, password);
					await sendEmailVerification(credential.user);
					await signOut(auth);
				} catch {
					emailFailed = true;
				}
			} else {
				await update({ reset: false });
			}
			busy = false;
		};
	};
</script>

<svelte:head><title>Create account</title></svelte:head>

<AuthCard title={createdEmail ? 'Check your email' : 'Create your account'}>
	{#if createdEmail}
		{#if emailFailed}
			<div role="alert" class="notice notice-warn">
				Your account was created, but we could not send the verification email. Sign in and choose
				"Resend verification email".
			</div>
		{:else}
			<div role="status" class="notice notice-ok">
				We sent a verification link to <strong>{createdEmail}</strong>. Open it, then sign in.
			</div>
		{/if}
		<a class="btn btn-primary" href={resolve('/signin')}>Go to sign in</a>
	{:else}
		{#if message}
			<div role="alert" class="notice notice-error">{message}</div>
		{/if}

		<form method="POST" class="flex flex-col gap-4" use:enhance={submit}>
			<div class="flex flex-col gap-1.5">
				<label class="label" for="email">Email</label>
				<input
					id="email"
					name="email"
					class="input"
					type="email"
					autocomplete="email"
					required
					value={form?.email ?? ''}
					aria-invalid={form?.reason === 'not-invited' ? 'true' : undefined}
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<label class="label" for="password">Password</label>
				<input
					id="password"
					name="password"
					class="input"
					type="password"
					autocomplete="new-password"
					required
					minlength="8"
					aria-describedby="password-help"
					aria-invalid={form?.reason === 'weak-password' ? 'true' : undefined}
				/>
				<span id="password-help" class="hint">At least 8 characters.</span>
			</div>
			<button class="btn btn-primary" type="submit" disabled={busy}>
				{busy ? 'Creating account…' : 'Create account'}
			</button>
		</form>

		<p class="text-center text-sm text-muted">
			Already have an account?
			<a class="font-bold text-herb" href={resolve('/signin')}>Sign in</a>
		</p>
	{/if}
</AuthCard>
