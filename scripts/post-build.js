const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Post-build script for LaLiga Fantasy Web
 * Automatically creates zip files after electron-builder completes
 */

function createZipFromDirectory(sourceDir, outputZip) {
  try {
    // Use PowerShell to create zip on Windows (built-in compression)
    const powershellCommand = `Compress-Archive -Path "${sourceDir}\\*" -DestinationPath "${outputZip}" -Force`;
    execSync(`powershell -Command "${powershellCommand}"`, { stdio: 'inherit' });

    return true;
  } catch (error) {
    return false;
  }
}

function getPackageVersion() {
  try {
    const packagePath = path.join(__dirname, '..', 'package.json');
    const packageContent = fs.readFileSync(packagePath, 'utf8');
    const packageJson = JSON.parse(packageContent);
    return packageJson.version;
  } catch (error) {
    return '1.0.0';
  }
}

async function postBuild(context) {
  const { outDir, electronPlatformName } = context;
  const version = getPackageVersion();

  if (electronPlatformName === 'win32') {
    // Look for the unpacked directory (from "dir" target)
    const unpackedDirName = `win-unpacked`;
    const unpackedPath = path.join(outDir, unpackedDirName);

    if (fs.existsSync(unpackedPath)) {
      // Create zip from unpacked directory
      const zipFileName = `LaLiga-Fantasy-App-v${version}.zip`;
      const zipPath = path.join(outDir, zipFileName);

      createZipFromDirectory(unpackedPath, zipPath);
    }
  }
}

// Export for electron-builder
module.exports = postBuild;

// Allow running directly for testing
if (require.main === module) {
  // Test mode - simulate context
  const testContext = {
    outDir: path.join(__dirname, '..', 'dist', `LaLiga-Fantasy-Web-v${getPackageVersion()}`),
    electronPlatformName: 'win32',
    appId: 'com.laliga.fantasy.web'
  };

  postBuild(testContext);
}
