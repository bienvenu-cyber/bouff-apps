

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = config => ({
  type: "widget",
  icon: '../../assets/icon.png',
  name: "orderActivity",
  bundleIdentifier: "bj.bouff.app.orderActivity",
  deploymentTarget: "16.2",

  entitlements: {
    "com.apple.security.application-groups": [
      "group.bj.bouff.app.shared"
    ],
  },

  frameworks: ["SwiftUI", "ActivityKit"],
});
