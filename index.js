#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');


// Determine the correct command based on OS
const isWindows = os.platform() === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';

// Function to spawn a process with proper error handling
function spawnProcess(command, args, options = {}) {
  const process = spawn(command, args, {
    stdio: 'pipe',
    ...options
  });

  process.stdout.on('data', (data) => {
      });

  process.stderr.on('data', (data) => {
    console.error(`[${options.name || 'Process'} ERROR] ${data.toString().trim()}`);
  });

  process.on('close', (code) => {
      });

  process.on('error', (err) => {
    console.error(`[${options.name || 'Process'} ERROR] Failed to start: ${err.message}`);
  });

  return process;
}

// Function to start the web application
function startWebApp(port = 3000) {
  
  const env = {
    ...process.env,
    PORT: port.toString(),
    BROWSER: 'none' // Prevent auto-opening browser
  };

  return spawnProcess(npmCommand, ['start'], {
    cwd: __dirname,
    env,
    name: `WebApp:${port}`
  });
}

// Function to check if a port is specified
function getPort() {
  const args = process.argv.slice(2);
  const portIndex = args.findIndex(arg => arg === '--port' || arg === '-p');

  if (portIndex !== -1 && args[portIndex + 1]) {
    return parseInt(args[portIndex + 1], 10);
  }

  return 3000; // Default port
}

// Function to show usage
function showUsage() {
  console.log(`
Usage: node index.js [options]

Options:
  --port, -p <port>     Specify the port for the web application (default: 3000)
  --dual               Start two instances on ports 3005 and 3006
  --help, -h           Show this help message

Examples:
  node index.js                    # Start on port 3000
  node index.js --port 3005        # Start on port 3005
  node index.js --dual             # Start on ports 3005 and 3006
`);
}

// Main execution
function main() {
  const args = process.argv.slice(2);

  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    showUsage();
    return;
  }

  // Check for dual mode
  if (args.includes('--dual')) {
    
    const app1 = startWebApp(3005);
    const app2 = startWebApp(3006);

            
    // Handle graceful shutdown
    process.on('SIGINT', () => {
            app1.kill();
      app2.kill();
      process.exit(0);
    });

    return;
  }

  // Single mode
  const port = getPort();
  const app = startWebApp(port);

    
  // Handle graceful shutdown
  process.on('SIGINT', () => {
        app.kill();
    process.exit(0);
  });
}

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
main();
