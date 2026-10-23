<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		sendEmailVerification,
		signInWithEmailAndPassword,
		signOut,
		type User
	} from 'firebase/auth';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import { auth } from '$lib/firebase';

	type Problem = 'invalid' | 'not-allowed' | 'unverified' | 'too-many' | 'error';

	// Firebase reports a wrong password and an unknown email with the same codes, so both get one message.
	const BAD_CREDENTIALS = [
		'auth/invalid-credential',
		'auth/wrong-password',
		'auth/user-not-found',
		'auth/invalid-email'
	];

	let email = $state('');
	let password = $state('');
	let busy = $state(false);
	let resent = $state(false);
	let problem = $state<Problem | null>(
		page.url.searchParams.get('reason') === 'not-allowed' ? 'not-allowed' : null
	);
	// Kept only while the "verify your email" notice is showing, so the link can be sent again.
	let unverifiedUser: User | null = null;

	const messages: Record<Problem, string> = {
		invalid: 'Email or password is incorrect.',
		'not-allowed': 'This app is invite-only, and that email is not on the list.',
		unverified: 'Verify your email to continue. Open the link we sent, then sign in again.',
		'too-many': 'Too many attempts. Wait a few minutes or reset your password.',
		error: 'Something went wrong. Try again.'
	};

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		busy = true;
		problem = null;
		resent = false;
		unverifiedUser = null;

		try {
			const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
			const idToken = await credential.user.getIdToken();
			const response = await fetch(resolve('/api/session'), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ idToken })
			});

			if (response.ok) {
				// The server cookie is the session; the browser SDK does not need to stay signed in.
				await signOut(auth);
				await goto(resolve('/recipes'), { invalidateAll: true });
				return;
			}

			const { code } = await response.json().catch(() => ({ code: 'error' }));
			if (code === 'unverified') {
				unverifiedUser = credential.user;
				problem = 'unverified';
			} else {
				await signOut(auth);
				problem = code === 'not-allowed' ? 'not-allowed' : 'error';
			}
		} catch (err) {
			const code = (err as { code?: string }).code ?? '';
			problem = BAD_CREDENTIALS.includes(code)
				? 'invalid'
				: code === 'auth/too-many-requests'
					? 'too-many'
					: 'error';
		} finally {
			busy = false;
		}
	};

	const resend = async () => {
		if (!unverifiedUser) return;
		busy = true;
		try {
			await sendEmailVerification(unverifiedUser);
			resent = true;
		} catch {
			problem = 'too-many';
		} finally {
			await signOut(auth);
			unverifiedUser = null;
			busy = false;
		}
	};
</script>

<svelte:head><title>Sign in</title></svelte:head>

<AuthCard title="Sign in">
	{#if resent}
		<div role="status" class="notice notice-ok">
			Verification email sent to {email.trim()}. Open the link, then sign in again.
		</div>
	{:else if problem}
		<div
			role={problem === 'unverified' ? 'status' : 'alert'}
			class="notice {problem === 'unverified'
				? 'notice-warn'
				: 'notice-error'} flex flex-col gap-2.5"
		>
			<div>{messages[problem]}</div>
			{#if problem === 'unverified'}
				<button type="button" class="btn btn-secondary self-start" disabled={busy} onclick={resend}>
					Resend verification email
				</button>
			{/if}
		</div>
	{/if}

	<form class="flex flex-col gap-4" onsubmit={submit}>
		<div class="flex flex-col gap-1.5">
			<label class="label" for="email">Email</label>
			<input
				id="email"
				class="input"
				type="email"
				autocomplete="email"
				required
				bind:value={email}
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<div class="flex items-baseline justify-between">
				<label class="label" for="password">Password</label>
				<a class="text-[13px] font-medium text-herb" href={resolve('/reset')}>Forgot password?</a>
			</div>
			<input
				id="password"
				class="input"
				type="password"
				autocomplete="current-password"
				required
				bind:value={password}
			/>
		</div>
		<button class="btn btn-primary" type="submit" disabled={busy}>
			{busy ? 'Signing in…' : 'Sign in'}
		</button>
	</form>

	<p class="text-center text-sm text-muted">
		Have an invite?
		<a class="font-bold text-herb" href={resolve('/signup')}>Create your account</a>
	</p>
</AuthCard>
