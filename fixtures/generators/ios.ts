// Generates every synthetic iOS (.ipa) fixture listed in docs/BUILD_BRIEF.md §7.1. Run with
// `npx tsx fixtures/generators/ios.ts`. See the `make-fixture` skill for the conventions this
// script follows (deterministic output, no real app binaries).
import { writeFixtureFile } from '../helpers/loadFixture.ts';
import { buildFatMachO, buildThinMachO, CPU_TYPE_ARM64, CPU_TYPE_X86_64 } from './machO.ts';
import { encodeBinaryPlist, encodeXmlPlist, type PlistEncodable } from './plist.ts';
import { buildZip, type ZipEntryInput } from './zip.ts';

const CLEAN_INFO: Record<string, string> = {
  CFBundleIdentifier: 'com.example.myapp',
  CFBundleShortVersionString: '1.0.0',
  CFBundleVersion: '1',
  MinimumOSVersion: '15.0',
  CFBundleExecutable: 'MyApp',
  DTXcode: '2600',
  DTXcodeBuild: '16A242d',
  DTSDKName: 'iphoneos26.0',
  DTPlatformVersion: '26.0',
  DTPlatformName: 'iphoneos',
};

function infoPlistXml(overrides: Record<string, string> = {}): string {
  return encodeXmlPlist({ ...CLEAN_INFO, ...overrides });
}

const USER_DEFAULTS_MANIFEST: PlistEncodable = {
  NSPrivacyAccessedAPITypes: [
    {
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
      NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
    },
  ],
};

function userDefaultsExecutable(): Uint8Array {
  return buildThinMachO({
    symtabSymbols: [{ name: '_OBJC_CLASS_$_NSUserDefaults', undefinedExternal: true }],
  });
}

async function writeIpa(name: string, entries: readonly ZipEntryInput[]): Promise<void> {
  writeFixtureFile(name, await buildZip(entries));
}

function generateNotAZip(): void {
  writeFixtureFile('ios-not-a-zip.ipa', new TextEncoder().encode('this is not a zip file\n'));
}

async function generateNoPayload(): Promise<void> {
  await writeIpa('ios-no-payload.ipa', [
    { name: 'README.txt', data: 'no Payload/ directory in this archive\n' },
  ]);
}

async function generatePassingApp(): Promise<void> {
  await writeIpa('ios-passing-app.ipa', [
    { name: 'Payload/MyApp.app/Info.plist', data: infoPlistXml() },
    { name: 'Payload/MyApp.app/MyApp', data: userDefaultsExecutable() },
    {
      name: 'Payload/MyApp.app/PrivacyInfo.xcprivacy',
      data: encodeXmlPlist(USER_DEFAULTS_MANIFEST),
    },
  ]);
}

async function generateOldXcode(): Promise<void> {
  await writeIpa('ios-old-xcode.ipa', [
    {
      name: 'Payload/MyApp.app/Info.plist',
      data: infoPlistXml({ DTXcode: '1640', DTSDKName: 'iphoneos18.5', DTPlatformVersion: '18.5' }),
    },
    { name: 'Payload/MyApp.app/MyApp', data: buildThinMachO({}) },
  ]);
}

async function generateOldMinimumOSVersion(): Promise<void> {
  await writeIpa('ios-old-minos.ipa', [
    { name: 'Payload/MyApp.app/Info.plist', data: infoPlistXml({ MinimumOSVersion: '12.0' }) },
    { name: 'Payload/MyApp.app/MyApp', data: buildThinMachO({}) },
  ]);
}

async function generatePriv001MissingManifest(): Promise<void> {
  await writeIpa('ios-priv-001-missing-manifest.ipa', [
    { name: 'Payload/MyApp.app/Info.plist', data: infoPlistXml() },
    {
      name: 'Payload/MyApp.app/MyApp',
      data: buildThinMachO({ symtabSymbols: [{ name: '_stat', undefinedExternal: true }] }),
    },
  ]);
}

async function generatePriv002MissingCategory(): Promise<void> {
  await writeIpa('ios-priv-002-missing-category.ipa', [
    { name: 'Payload/MyApp.app/Info.plist', data: infoPlistXml() },
    {
      name: 'Payload/MyApp.app/MyApp',
      data: buildThinMachO({ symtabSymbols: [{ name: '_statfs', undefinedExternal: true }] }),
    },
    {
      name: 'Payload/MyApp.app/PrivacyInfo.xcprivacy',
      data: encodeXmlPlist(USER_DEFAULTS_MANIFEST),
    },
  ]);
}

async function generatePriv003BadReasonCode(): Promise<void> {
  await writeIpa('ios-priv-003-bad-reason-code.ipa', [
    { name: 'Payload/MyApp.app/Info.plist', data: infoPlistXml() },
    { name: 'Payload/MyApp.app/MyApp', data: userDefaultsExecutable() },
    {
      name: 'Payload/MyApp.app/PrivacyInfo.xcprivacy',
      data: encodeXmlPlist({
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
            NSPrivacyAccessedAPITypeReasons: ['ZZZZ.9'],
          },
        ],
      }),
    },
  ]);
}

async function generatePriv003MalformedManifest(): Promise<void> {
  await writeIpa('ios-priv-003-malformed-manifest.ipa', [
    { name: 'Payload/MyApp.app/Info.plist', data: infoPlistXml() },
    { name: 'Payload/MyApp.app/MyApp', data: userDefaultsExecutable() },
    {
      name: 'Payload/MyApp.app/PrivacyInfo.xcprivacy',
      data: encodeXmlPlist({ NSPrivacyAccessedAPITypes: 'not an array' }),
    },
  ]);
}

async function generatePriv004ListedSdkNoManifest(): Promise<void> {
  await writeIpa('ios-priv-004-listed-sdk-no-manifest.ipa', [
    { name: 'Payload/MyApp.app/Info.plist', data: infoPlistXml() },
    { name: 'Payload/MyApp.app/MyApp', data: buildThinMachO({}) },
    {
      name: 'Payload/MyApp.app/Frameworks/Alamofire.framework/Info.plist',
      data: infoPlistXml({ CFBundleExecutable: 'Alamofire' }),
    },
  ]);
}

async function generatePriv004ListedSdkWithManifest(): Promise<void> {
  await writeIpa('ios-priv-004-listed-sdk-with-manifest.ipa', [
    { name: 'Payload/MyApp.app/Info.plist', data: infoPlistXml() },
    { name: 'Payload/MyApp.app/MyApp', data: buildThinMachO({}) },
    {
      name: 'Payload/MyApp.app/Frameworks/Alamofire.framework/Info.plist',
      data: infoPlistXml({ CFBundleExecutable: 'Alamofire' }),
    },
    {
      name: 'Payload/MyApp.app/Frameworks/Alamofire.framework/PrivacyInfo.xcprivacy',
      data: encodeXmlPlist({ NSPrivacyAccessedAPITypes: [] }),
    },
  ]);
}

async function generateAppExOldSdk(): Promise<void> {
  await writeIpa('ios-appex-old-sdk.ipa', [
    { name: 'Payload/MyApp.app/Info.plist', data: infoPlistXml() },
    { name: 'Payload/MyApp.app/MyApp', data: buildThinMachO({}) },
    {
      name: 'Payload/MyApp.app/PlugIns/Share.appex/Info.plist',
      data: infoPlistXml({
        CFBundleExecutable: 'Share',
        DTXcode: '1640',
        DTSDKName: 'iphoneos18.5',
        DTPlatformVersion: '18.5',
      }),
    },
    { name: 'Payload/MyApp.app/PlugIns/Share.appex/Share', data: buildThinMachO({}) },
  ]);
}

async function generateFatBinary(): Promise<void> {
  const fat = buildFatMachO([
    {
      cputype: CPU_TYPE_X86_64,
      thin: buildThinMachO({
        symtabSymbols: [{ name: '_x86OnlySymbol', undefinedExternal: true }],
      }),
    },
    { cputype: CPU_TYPE_ARM64, thin: userDefaultsExecutable() },
  ]);
  await writeIpa('ios-fat-binary.ipa', [
    { name: 'Payload/MyApp.app/Info.plist', data: infoPlistXml() },
    { name: 'Payload/MyApp.app/MyApp', data: fat },
    {
      name: 'Payload/MyApp.app/PrivacyInfo.xcprivacy',
      data: encodeXmlPlist(USER_DEFAULTS_MANIFEST),
    },
  ]);
}

async function generateEncryptedBinary(): Promise<void> {
  await writeIpa('ios-encrypted-binary.ipa', [
    { name: 'Payload/MyApp.app/Info.plist', data: infoPlistXml() },
    {
      name: 'Payload/MyApp.app/MyApp',
      data: buildThinMachO({
        symtabSymbols: [{ name: '_stat', undefinedExternal: true }],
        objcSelectors: ['systemUptime'],
        encrypted: true,
      }),
    },
  ]);
}

async function generateBinaryPlistVariant(): Promise<void> {
  await writeIpa('ios-binary-plist.ipa', [
    { name: 'Payload/MyApp.app/Info.plist', data: encodeBinaryPlist(CLEAN_INFO) },
    { name: 'Payload/MyApp.app/MyApp', data: userDefaultsExecutable() },
    {
      name: 'Payload/MyApp.app/PrivacyInfo.xcprivacy',
      data: encodeBinaryPlist(USER_DEFAULTS_MANIFEST),
    },
  ]);
}

async function main(): Promise<void> {
  generateNotAZip();
  await generateNoPayload();
  await generatePassingApp();
  await generateOldXcode();
  await generateOldMinimumOSVersion();
  await generatePriv001MissingManifest();
  await generatePriv002MissingCategory();
  await generatePriv003BadReasonCode();
  await generatePriv003MalformedManifest();
  await generatePriv004ListedSdkNoManifest();
  await generatePriv004ListedSdkWithManifest();
  await generateAppExOldSdk();
  await generateFatBinary();
  await generateEncryptedBinary();
  await generateBinaryPlistVariant();
}

await main();
