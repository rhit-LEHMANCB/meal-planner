<script lang="ts">
	import { resolve } from '$app/paths';
	import { sendPasswordResetEmail } from 'firebase/auth';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import { auth } from '$lib/firebase';

	let email = $state('');
	let busy = $state(false);
	let sent = $state(false);

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		busy = true;
		try {
			await sendPasswordResetEmail(auth, email.trim());
		} catch {
			// Deliberately ignored: the page answers the same way for every address, so it cannot be
			// used to find out which emails have accounts.
		} finally {
			busy = false;
			sent = true;
		}
	};
</script>

<svelte:head><title>Reset password</title></svelte:head>

<AuthCard title="Reset your password">
	{#if sent}
		<div role="status" class="notice notice-ok">
			If <strong>{email.trim()}</strong> has an account, we sent a link to reset the password.
		</div>
		<a class="btn btn-primary" href={resolve('/signin')}>Back to sign in</a>
	{:else}
		<p class="text-sm text-muted">Enter your email and we will send you a reset link.</p>
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
			<button class="btn btn-primary" type="submit" disabled={busy}>
				{busy ? 'Sending…' : 'Send reset link'}
			</button>
		</form>
		<p class="text-center text-sm text-muted">
			<a class="font-bold text-herb" href={resolve('/signin')}>Back to sign in</a>
		</p>
	{/if}
</AuthCard>
