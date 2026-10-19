<script setup lang="ts">
/**
 * Anmeldung mit dem Zugangspasswort.
 *
 * Ohne Navigation: vor der Anmeldung gibt es nichts, wohin man gehen koennte.
 */
definePageMeta({ layout: false });
useHead({ title: 'Anmelden' });

const route = useRoute();
const { fetch: refreshSession } = useUserSession();
const { readError } = useApiError();

const password = ref('');
const saving = ref(false);
const message = ref<string | null>(null);

/** Nur Pfade innerhalb der App, sonst liesse sich ein fremder Link unterschieben. */
function target(): string {
  const next = route.query.weiter;
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

async function login() {
  saving.value = true;
  message.value = null;
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { password: password.value } });
    await refreshSession();
    await navigateTo(target());
  } catch (err) {
    message.value = readError(err).message;
    password.value = '';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-leinen-100 px-6 text-leinen-900">
    <div class="w-full max-w-sm rounded-[12px] border border-leinen-200/70 bg-leinen-50 p-6">
      <div class="mb-6 flex items-center gap-2">
        <span class="size-2.5 rounded-full bg-trd-500" aria-hidden="true" />
        <h1 class="text-sm font-semibold tracking-tight">The Refined Decor</h1>
      </div>

      <form class="space-y-4" @submit.prevent="login">
        <UAlert
          v-if="message"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          class="rounded-[12px]"
          :description="message"
        />
        <UFormField label="Passwort" required>
          <UInput
            v-model="password"
            type="password"
            autocomplete="current-password"
            autofocus
            class="w-full"
          />
        </UFormField>
        <UButton type="submit" :loading="saving" block class="rounded-[8px]">
          Anmelden
        </UButton>
      </form>
    </div>
  </main>
</template>
