import { authClient } from './auth-client';

export async function loginWithCredentials(
  username: string,
  password: string
): Promise<{ success: boolean; message?: string }> {
  const { error } = await authClient.signIn.username({
    username: username.trim(),
    password,
  });

  if (error) {
    return { success: false, message: 'Username atau kata sandi tidak sesuai.' };
  }

  return { success: true };
}

export async function logoutSession() {
  await authClient.signOut();
}
