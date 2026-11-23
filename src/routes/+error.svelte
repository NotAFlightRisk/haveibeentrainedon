<script lang="ts">
  import { page } from '$app/state';
  import Band from '#lib/components/Band.svelte';
</script>

<svelte:head>
  <title>{page.status} - Have I Been Trained On?</title>
</svelte:head>

<Band>
  <h1>{page.status === 404 ? 'Nothing filed under that' : 'Something broke'}</h1>
  <p>{page.error?.message}</p>
  <p><a href="/">Check a page instead</a></p>
</Band>

<style>
  h1 {
    font-size: clamp(1.6rem, 4vw, 2.4rem);
  }
</style>
