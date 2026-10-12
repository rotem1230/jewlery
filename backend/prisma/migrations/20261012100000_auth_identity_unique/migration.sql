-- One account per external identity: concurrent first sign-ins can no longer create duplicates.
CREATE UNIQUE INDEX "users_authProvider_authProviderSub_key" ON "users"("authProvider", "authProviderSub");
