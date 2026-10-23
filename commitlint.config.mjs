export default {
  extends: ['@commitlint/config-conventional'],
  // Dependabot's generated bodies embed release-note lines longer than the limit. Match its
  // sign-off trailer, which survives a squash merge, rather than who pushed the commit.
  ignores: [(message) => message.includes('Signed-off-by: dependabot[bot]')],
};
