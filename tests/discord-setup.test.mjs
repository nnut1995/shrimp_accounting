import test from 'node:test';
import assert from 'node:assert/strict';
import { setupHeaders, validSetupRequest } from '../scripts/discord-bot/setup-security.mjs';
test('local setup form preserves Origin on same-origin submission', () => {
  // Browser repro: no-referrer strips Origin to null on native form POST.
  assert.equal(setupHeaders['Referrer-Policy'], 'same-origin');
  assert.match(setupHeaders['Content-Security-Policy'], /form-action 'self'/);
});
test('setup accepts its own form, still rejects opaque/cross-site origins and wrong links', () => {
  const req = {method:'POST',url:'/test-link',headers:{host:'127.0.0.1:52206',origin:'http://127.0.0.1:52206'}};
  assert.equal(validSetupRequest(req,52206,'test-link'),true);
  for (const origin of [undefined,'null','https://evil.example','http://127.0.0.1:52207']) {
    assert.equal(validSetupRequest({...req,headers:{...req.headers,origin}},52206,'test-link'),false);
  }
  assert.equal(validSetupRequest({...req,url:'/old-link'},52206,'test-link'),false);
  assert.equal(validSetupRequest({...req,headers:{...req.headers,host:'evil.example'}},52206,'test-link'),false);
  assert.equal(validSetupRequest({...req,method:'GET',headers:{host:'127.0.0.1:52206'}},52206,'test-link'),true);
});
