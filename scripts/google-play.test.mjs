import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

for (const app of ['enatega-multivendor-app', 'enatega-multivendor-store']) {
  const config = JSON.parse(readFileSync(new URL(`../${app}/eas.json`, import.meta.url), 'utf8'));

  test(`${app}: Google Play builds a production AAB, not a development APK`, () => {
    const profile = config.build['google-play'];
    assert.equal(profile.extends, 'production');
    assert.equal(profile.distribution, 'store');
    assert.equal(profile.environment, 'production');
    assert.equal(profile.developmentClient, false);
    assert.equal(profile.android.buildType, 'app-bundle');
  });

  test(`${app}: store versions increment remotely`, () => {
    assert.equal(config.cli.appVersionSource, 'remote');
    assert.equal(config.build['google-play'].autoIncrement, true);
  });

  test(`${app}: submission stays an internal draft`, () => {
    assert.equal(config.submit['google-play'].android.track, 'internal');
    assert.equal(config.submit['google-play'].android.releaseStatus, 'draft');
  });

  test(`${app}: direct installation keeps its APK profile`, () => {
    assert.equal(config.build.staging.distribution, 'internal');
    assert.equal(config.build.staging.android.buildType, 'apk');
  });
}