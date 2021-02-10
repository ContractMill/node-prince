/*
 **  node-prince -- Node API for executing PrinceXML via prince(1) CLI
 **  Copyright (c) 2014-2021 Dr. Ralf S. Engelschall <rse@engelschall.com>
 **
 **  Permission is hereby granted, free of charge, to any person obtaining
 **  a copy of this software and associated documentation files (the
 **  "Software"), to deal in the Software without restriction, including
 **  without limitation the rights to use, copy, modify, merge, publish,
 **  distribute, sublicense, and/or sell copies of the Software, and to
 **  permit persons to whom the Software is furnished to do so, subject to
 **  the following conditions:
 **
 **  The above copyright notice and this permission notice shall be included
 **  in all copies or substantial portions of the Software.
 **
 **  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 **  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 **  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 **  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 **  CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 **  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 **  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/* global process: false */
/* global __dirname: false */
/* global require: false */
/* global console: false */
/* eslint no-console: 0 */

/*
 *  prince-npm.js: NPM install-time integration
 */

/*  core requirements  */
const child_process = require("child_process");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/*  extra requirements  */
const progress = require("progress");
const request = require("request");
const which = require("which");
const chalk = require("chalk");
const tar = require("tar");
const rimraf = require("rimraf");
const mkdirp = require("mkdirp");
const unzip = require("unzip-stream");

const PRINCE_VERSION = 14;

/*  determine path and version of prince(1)  */
let princeInfo = function () {
  return new Promise(function (resolve, reject) {
    which("prince", function (error, filename) {
      if (error) {
        reject("prince(1) not found in PATH: " + error);
        return;
      }
      child_process.execFile(
        filename,
        ["--version"],
        function (error, stdout, stderr) {
          if (error !== null) {
            reject('prince(1) failed on "--version": ' + error);
            return;
          }
          let m = stdout.match(/^Prince\s+(\d+(?:\.\d+)?)/);
          if (!(m !== null && typeof m[1] !== "undefined")) {
            reject(
              'prince(1) returned unexpected output on "--version":\n' +
                stdout +
                stderr
            );
            return;
          }
          resolve({ command: filename, version: m[1] });
        }
      );
    });
  });
};

async function getLinuxOSInfo() {
  return new Promise(function (resolve, reject) {
    child_process.exec(`sh "${path.join(__dirname, 'shtool')}" platform -t binary`, function (error, stdout) {
      if (error) reject(error);

      const osRegex = new RegExp('([a-zA-Z0-9].*)\-([a-zA-Z]{1,10})([0-9]{1,5}.[0-9]{1,5}.?[0-9]{1,5})', 'i')
      const [ _, osCPUArch, osName, osVersion ] = stdout.toString().toLowerCase().match(osRegex)
      
      resolve({osCPUArch, osName, osVersion})
    })
  })
}

/*  return download URL for latest PrinceXML distribution  */
const princeDownloadURL = function () {
  return new Promise(async function (resolve /*, reject */) {
    const platform = process.platform

    switch(platform) {
      // Windows
      case "wind32": {
        switch(process.arch) {
          case 'x64': {
            resolve(`https://www.princexml.com/download/prince-${PRINCE_VERSION}-win64-setup.exe`);
            break;    
          }
          case 'ia32':
          case 'x32': {
            resolve(`https://www.princexml.com/download/prince-${PRINCE_VERSION}-win32-setup.exe`);
            break;
          }
          default: {
            throw new Error(`Unsupported architecture: ${process.arch}`)
          }
        }
        break;
      }
      // MacOS
      case "darwin": {
        const osInfo = await getLinuxOSInfo()
        resolve(`https://www.princexml.com/download/prince-${PRINCE_VERSION}-macos.zip`);
        break;
      }
      // Linux
      case "linux": {
        const {osCPUArch, osName, osVersion} = await getLinuxOSInfo()

        switch(osName) {
          // Ubuntu
          case 'ubuntu': {
            switch(osCPUArch) {
              case 'amd64': {
                // Ubuntu 14.x 15.x
                if (/^1[45](?:\.\d+)*$/.test(osVersion)) {
                  resolve(`https://www.princexml.com/download/prince-${PRINCE_VERSION}-ubuntu14.04-amd64.tar.gz`);
                }
                // Ubuntu 16.x 17.x
                else if (/^1[67](?:\.\d+)*$/.test(osVersion)) {
                  resolve(`https://www.princexml.com/download/prince-${PRINCE_VERSION}-ubuntu16.04-amd64.tar.gz`);
                }
                // Ubuntu 18.x 19.x
                else if (/^1[89](?:\.\d+)*$/.test(osVersion)) {
                  resolve(`https://www.princexml.com/download/prince-${PRINCE_VERSION}-ubuntu18.04-amd64.tar.gz`);
                }
                // Ubuntu 20.x 21.x
                else if (/^2[01](?:\.\d+)*$/.test(osVersion)) {
                  resolve(`https://www.princexml.com/download/prince-${PRINCE_VERSION}-ubuntu20.04-amd64.tar.gz`);
                }
                else {
                  throw new Error(`Unknown os version: ${osVersion}`)
                }
                
                break;
              }
              case 'ix86': {
                // Ubuntu 14.x 15.x
                if (/^1[45](?:\.\d+)*$/.test(osVersion)) {
                  resolve(`https://www.princexml.com/download/prince-${PRINCE_VERSION}-ubuntu14.04-i386.tar.gz`);
                }
                // Ubuntu 16.x 17.x
                else if (/^1[67](?:\.\d+)*$/.test(osVersion)) {
                  resolve(`https://www.princexml.com/download/prince-${PRINCE_VERSION}-ubuntu16.04-i386.tar.gz`);
                }
                // Ubuntu 18.x 19.x
                else if (/^1[89](?:\.\d+)*$/.test(osVersion)) {
                  resolve(`https://www.princexml.com/download/prince-${PRINCE_VERSION}-ubuntu18.04-i386.tar.gz`);
                }
                else {
                  throw new Error(`Unknown os version: ${osVersion}`)
                }
                
                break;
              }
              default: {
                throw new Error(`Unsupported architecture: "${osCPUArch}"`)
              }
            }
            break;
          }
        }
        break;
      }
      
      // Debian
      case 'debian': {
        switch(osCPUArch) {
          case 'amd64': {
            // Debian 10
            if(/^10(?:\.\d+)*$/.test(osVersion)) {
              resolve(`https://www.princexml.com/download/prince-${PRINCE_VERSION}-debian10-amd64.tar.gz`);
            }
            // Debian 9
            else if(/^9(?:\.\d+)*$/.test(osVersion)) {
              resolve(`https://www.princexml.com/download/prince-${PRINCE_VERSION}-debian9-amd64.tar.gz`);
            }
            // Debian 8
            else if(/^8(?:\.\d+)*$/.test(osVersion)) {
              resolve(`https://www.princexml.com/download/prince-${PRINCE_VERSION}-debian8-amd64.tar.gz`);
            }
            else {
              throw new Error(`Unknown os version: ${osVersion}`)
            }
          } 
          default: {
            throw new Error(`Unsupported architecture: "${osCPUArch}"`)
          }
        }
        break;
      }

      // CentOS
      case 'centos': {
        switch(osCPUArch) {
          case 'amd64': {
            // CentOS 8
            if(/^8(?:\.\d+)*$/.test(osVersion)) {
              resolve(`https://www.princexml.com/download/prince-${PRINCE_VERSION}-centos8-x86_64.tar.gz`);
            }
            // CentOS 7
            else if(/^7(?:\.\d+)*$/.test(osVersion)) {
              resolve(`https://www.princexml.com/download/prince-${PRINCE_VERSION}-centos7-x86_64.tar.gz`);
            }
            // CentOS 6
            else if(/^6(?:\.\d+)*$/.test(osVersion)) {
              resolve(`https://www.princexml.com/download/prince-${PRINCE_VERSION}-centos6-x86_64.tar.gz`);
            }
            else {
              throw new Error(`Unknown os version: ${osVersion}`)
            }
          } 
          default: {
            throw new Error(`Unsupported architecture: "${osCPUArch}"`)
          }
        }
        break;
      }

      // Alpine
      case 'alpine': {
        switch(osCPUArch) {
          default: {
            throw new Error(`Unsupported architecture: "${osCPUArch}"`)
          }
        }
        break;
      }
      default: {
        throw new Error(`Unsupported platform: "${platform}"`)
      }
    }
  });
};

/*  download data from URL  */
let downloadData = function (url) {
  return new Promise(function (resolve, reject) {
    let options = {
      method: "GET",
      url: url,
      encoding: null,
      headers: {
        "User-Agent": "node-prince (prince-npm.js:install)",
      },
    };
    new Promise(function (resolve /*, reject  */) {
      if (
        typeof process.env.http_proxy === "string" &&
        process.env.http_proxy !== ""
      ) {
        options.proxy = process.env.http_proxy;
        console.log("-- using proxy ($http_proxy): " + options.proxy);
        resolve();
      } else {
        child_process.exec("npm config get proxy", function (
          error,
          stdout /*, stderr */
        ) {
          if (error === null) {
            stdout = stdout.toString().replace(/\r?\n$/, "");
            if (stdout.match(/^https?:\/\/.+/)) {
              options.proxy = stdout;
              console.log(
                "-- using proxy (npm config get proxy): " + options.proxy
              );
            }
          }
          resolve();
        });
      }
    }).then(function () {
      console.log("-- download: " + url);
      let req = request(options, function (error, response, body) {
        if (!error && response.statusCode === 200) {
          console.log("-- download: " + body.length + " bytes received.");
          resolve(body);
        } else reject("download failed: " + error);
      });
      let progress_bar = null;
      req.on("response", function (response) {
        let len = parseInt(response.headers["content-length"], 10);
        progress_bar = new progress(
          "-- download: [:bar] :percent (ETA: :etas)",
          {
            complete: "#",
            incomplete: "=",
            width: 40,
            total: len,
          }
        );
      });
      req.on("data", function (data) {
        if (progress_bar !== null) progress_bar.tick(data.length);
      });
    });
  });
};

/*  extract a tarball (*.tar.gz)  */
let extractTarball = function (tarball, destdir, stripdirs) {
  return new Promise(function (resolve, reject) {
    fs.createReadStream(tarball)
      .pipe(zlib.createGunzip())
      .pipe(tar.extract({ cwd: destdir, strip: stripdirs }))
      .on("error", function (error) {
        reject(error);
      })
      .on("close", function () {
        /* global setTimeout: true */ setTimeout(function () {
          resolve();
        }, 500);
      });
  });
};

async function saveFileToDisk(file, data) {
  new Promise(function (resolve, reject) {
    fs.writeFile(file, data, function (err) {
      if (err) reject(err);

      resolve();
    });
  });
}

async function createTmpDir(pathDir) {
  return new Promise(function (resolve, reject) {
    fs.mkdtemp(path.join(__dirname, "tmp-"), function (err, tmpdir) {
      if (err) reject(err);

      resolve(tmpdir);
    });
  });
}

async function removeTmpDir(pathToTmp) {
  return new Promise(function (resolve, reject) {
    fs.rmdir(pathToTmp, { recursive: true }, function (err) {
      if (err) reject(err);

      resolve();
    });
  });
}

async function unzipArchive(pathToFile, destdir) {
  return new Promise(function (resolve, reject) {
    fs.createReadStream(pathToFile)
      .pipe(unzip.Extract({ path: destdir }))
      .on("error", function (error) {
        reject(error);
      })
      .on("close", function () {
        resolve();
      });
  });
}

async function readDir(dir) {
  return new Promise(function (resolve, reject) {
    fs.readdir(dir, function (err, files) {
      if (err) reject(err);

      resolve(files);
    });
  });
}

async function readFileStat(pathToFile) {
  return new Promise(function (resolve, reject) {
    fs.stat(pathToFile, function (err, stat) {
      if (err) reject(err);

      resolve(stat);
    });
  });
}

async function moveFiles(source, dest) {
  return new Promise(function (resolve, reject) {
    fs.rename(source, dest, function (err) {
      if (err) reject(err);

      resolve();
    });
  });
}

async function makePrinceExecutable(dirPath) {
  return new Promise(function (resolve, reject) {
    try {
      fs.chmodSync(path.join(dirPath, "lib/prince/bin/prince"), 0o755);
      fs.chmodSync(path.join(dirPath, "lib/prince/bin/princedebug"), 0o755);

      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

/*  main procedure  */
if (process.argv.length !== 3) {
  console.log(chalk.red("ERROR: invalid number of arguments"));
  process.exit(1);
}

let destdir;

async function install() {
  /*  installation procedure  */
  console.log("++ checking for globally installed PrinceXML");
  princeInfo().then(
    function (prince) {
      console.log("-- found prince(1) command: " + chalk.blue(prince.command));
      console.log("-- found prince(1) version: " + chalk.blue(prince.version));
    },
    function (/* error */) {
      console.log("++ downloading PrinceXML distribution");
      princeDownloadURL().then(function (url) {
        downloadData(url).then(
          async function (data) {
            console.log("++ locally unpacking PrinceXML distribution");
            destdir = path.join(__dirname, "prince");

            let destfile;

            switch (process.platform) {
              case "win32": {
                destfile = path.join(__dirname, "prince.exe");

                fs.writeFileSync(destfile, data, { encoding: null });
                let args = [
                  "/s",
                  "/a",
                  '/vTARGETDIR="' + path.resolve(destdir) + '" /qn',
                ];

                child_process.execFile(
                  destfile,
                  args,
                  function (error, stdout, stderr) {
                    if (error !== null) {
                      console.log(
                        chalk.red("** ERROR: failed to extract: " + error)
                      );
                      stdout = stdout.toString();
                      stderr = stderr.toString();
                      if (stdout !== "") console.log("** STDOUT: " + stdout);
                      if (stderr !== "") console.log("** STDERR: " + stderr);
                    } else {
                      fs.unlinkSync(destfile);
                      console.log(
                        "-- OK: local PrinceXML installation now available"
                      );
                    }
                  }
                );

                break;
              }

              case "darwin": {
                let tempDir;

                try {
                  // Create a temp directory
                  tempDir = await createTmpDir(path.join(__dirname, "tmp-"));

                  const archFileName = path.join(tempDir, "prince.zip");

                  await saveFileToDisk(archFileName, data);

                  // Unarchive file
                  await unzipArchive(archFileName, tempDir);

                  fs.unlinkSync(archFileName);

                  // Get all files and directories in the temp directory
                  const files = await readDir(tempDir);

                  if (!Array.isArray(files) || files.length === 0) {
                    throw new Error(
                      `No files found in the temp directory: ${tempDir}`
                    );
                  }

                  if (files.length === 1) {
                    const fName = files[0];
                    const fileStat = await readFileStat(
                      path.join(tempDir, fName)
                    );

                    if (!fileStat.isDirectory()) {
                      throw new Error(
                        `Found one file in the temp directory. Expected a directory`
                      );
                    }

                    // Move all files and directories from the directory to the target
                    await moveFiles(path.join(tempDir, fName), destdir);

                    // Make Prince binary executable
                    await makePrinceExecutable(destdir);
                  }

                  await removeTmpDir(tempDir);
                } catch (error) {
                  await removeTmpDir(tempDir);

                  throw error;
                }

                break;
              }

              case "linux": {
                destfile = path.join(__dirname, "prince.tgz");

                fs.writeFileSync(destfile, data, { encoding: null });
                mkdirp.sync(destdir);

                extractTarball(destfile, destdir, 1).then(
                  function () {
                    fs.unlinkSync(destfile);
                    console.log(
                      "-- OK: local PrinceXML installation now available"
                    );
                  },
                  function (error) {
                    console.log(
                      chalk.red("** ERROR: failed to extract: " + error)
                    );
                  }
                );

                break;
              }
              default: {
                console.log(`-- Unknown platform "${process.platform}"`);
              }
            }
          },
          function (error) {
            console.log(chalk.red("** ERROR: failed to download: " + error));
          }
        );
      });
    }
  );
}

async function uninstall() {
  /*  uninstallation procedure  */
  destdir = path.join(__dirname, "prince");
  if (fs.existsSync(destdir)) {
    console.log("++ deleting locally unpacked PrinceXML distribution");
    rimraf(destdir, function (error) {
      if (error !== null) console.log(chalk.red("** ERROR: " + error));
      else console.log("-- OK: done");
    });
  }
}

if (process.argv[2] === "install") {
  install();
} else if (process.argv[2] === "uninstall") {
  uninstall();
} else {
  console.log(chalk.red("ERROR: invalid argument"));
  process.exit(1);
}
