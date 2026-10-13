import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync,randomBytes } from 'node:crypto';
import { verifyAccount } from './auth';
test('account verification accepts the exact password and rejects wrong account or password',async()=>{
 const salt=randomBytes(24);const password='test-password-only-123';const record={version:1 as const,username:'testuser',iterations:10000,salt:salt.toString('base64url'),hash:pbkdf2Sync(password,salt,10000,32,'sha256').toString('base64url')};
 assert.equal(await verifyAccount(record,'testuser',password),true);assert.equal(await verifyAccount(record,'wrong',password),false);assert.equal(await verifyAccount(record,'testuser','incorrect'),false);assert.equal(await verifyAccount({...record,iterations:1000000},'testuser',password),false);
});
