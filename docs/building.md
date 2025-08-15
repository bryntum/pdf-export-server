# Build PDF Export Server into single executable

This guide explains how to build the PDF Export Server project using the `build.js` file. The process involves running
the `build.js` script, which automates various tasks to compile the project into a single executable. The steps outlined
below detail each aspect of the process, including the tasks performed by the script and the supported Node.js versions.

---

## Prerequisites

1. **Node.js**:  
   Ensure you have Node.js installed on your system. This project supports the latest stable releases starting from
   **20.x.x** which are also supported by the [@yao-pkg/pkg-fetch package](https://github.com/yao-pkg/pkg-fetch/)

   You can check your current Node.js version by running:
   ```bash
   node -v
   ```
   Upgrade or install a compatible version if needed:
   [Download Node.js here](https://nodejs.org/).

2. **Dependencies**:  
   Before building, ensure all project dependencies have been installed by running:
   ```bash
   npm install
   ```
---

## Building the Project

To build the project, run:
   ```bash
   npm run build
   ```
This will initiate the build process and generate executable with required assets, and put it all to the `/dist` folder.
That folder has the following structure:
```
- dist
  - chrome // Chrome distribution downloaded by puppeteer
  - log    // Target directory to log server events
  - cert   // Optional directory to provide server with SSL certificates
  pdf-export-server* // executable
```

### Building for a target platform

It is possible to build executable for a different target platform. By default, script will use current platform. To
use a different platform you can run corresponding command:
```shell
npm run build:win
npm run build:linux
npm run build:macos
```

---

## What Happens Under the Hood?

The `build.js` file orchestrates the build process by automating several tasks:

1. **Environment Setup**:
    - The script prepares the environment by ensuring required files, directories, and configurations are in place.
    - It checks for any missing dependencies, validates files, and creates temporary folders as needed.

2. **Bundling the Code**:
    - The script uses [@yao-pkg/pkg](https://www.npmjs.com/package/@yao-pkg/pkg) to bundle the entire Node.js
      project into a single executable binary. This step includes:
        - Packaging dependencies.
        - Including relevant assets and configuration files.

3. **Output Generation**:
    - The build script generates a final executable file (e.g., `pdf-export-server.exe` for Windows or a Linux/MacOS
    - binary), which can be shared and executed without needing explicit Node.js runtime.

---

## Additional Notes

- **Output Directory**:
  The final executable and additional build outputs are stored in a dedicated `dist` directory, which you can locate
  after the build completes.

- **Cross-Platform Builds**:
  If you intend to generate builds for multiple operating systems (e.g., Windows, macOS, Linux), ensure your environment
  supports cross-compilation. 

---

## Testing the Build Output

1. After the build process finishes, navigate to the directory containing the executable (e.g., `dist/`).
2. Run the executable to ensure it performs as expected:
   ```bash
   ./pdf-export-server
   ```

Any issues encountered during execution can be resolved by inspecting the logs or reexamining the build setup.

---

By following this guide, you should be able to successfully build the project into a single executable with ease. If you
encounter any specific issues, check the logs during the build or review the `build.js` script for deeper insights into
the underlying process.