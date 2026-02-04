// ----------------------------
// ### Node script to deploy new/modified code from a project to its staging repo
//
// Usage: node <pathToScript>/stage.js [stagingType] [componentName] [componentName]
// 
// Code is taken from the specified component (Default: all components & modules) and moved to docs dir of staging repo
// The "staging type" defines how files are presented on staging
// 1    -   Copy files "as is" to staging
// 2    -   Copy minified versions to staging (default if not specified)
// 3    -   Copy full files with production substitutions
// 4    -   Full, minified, production version
// 8    -   Used when calling from deploy.js
//
// Specify 'modules' to deploy changes to files in modules directory.
// All module files will be updated
//
// Removing files from staging has to be done manually
//
// Dependencies:
// - uglify-js
// - html-minifier
// > npm install --save uglify-js html-minifier-next terser
// ----------------------------

// ### Load modules 
// Get FileSystem access functions
import {
    copyFile as fs_copyFile,
    mkdir as fs_mkdir,
    readdir as fs_readdir,
    readFile as fs_readFile,
    stat as fs_stat,
    writeFile as fs_writeFile
} from 'fs/promises';
// Allow shell commands
import { execSync as cp_exec } from 'child_process';
// Minifiers
import { minify as minify_t } from 'terser';
import { minify as minify_u } from 'uglify-js';
import { minify as minify_h } from 'html-minifier-next';
import * as myLib from './lib.js';

// ### Define constants
// Repo names
const prodRepo = 'rt-comps.github.io';
const stageRepo = 'stage';
// JS minifier options
//  Full minify (via terser)
const miniTOpt = {
    module: true
}
//  Just remove comments (via uglify-js)
const miniUOpt = {
    compress: false,
    mangle: false,
    output: {
        beautify: true
    }
}
// 'html-minifier' options
const miniHOpt1 = {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true
}
const miniHOpt2 = {
    removeComments: true
}
//  Default paths to search for components
const defaultParams = [
    'components',
    'modules',
    'static'
]
//  Flags
// Default to stage type 1
let stgType = 2;

// ### Local Functions

// --- constSub
// Make substitions for constants when required for moving from dev to prod environments
//  Substitutions are define in the source file as follows (JSON format)
//      ForProd: { "<nameOfConstant": "<valueOfConstant", ... }
//  "ForProd:" can be used multiple times in a file and each instance can define 1+ properties
function constSub(contents) {
    let subs;
    // Find all substitutions provided in file and merge in to a single object
    const toSub = contents.match(/ForProd\:.*/g);
    // Were any substitutions found?
    if (toSub) {
        // Collect all substitutions found in file into a Map
        if (toSub.length > 1) {
            // Reduce multiple Objects to single Map
            subs = toSub.reduce((acc, line) => {
                // convert JSON Object to Map
                const map = new Map(Object.entries(JSON.parse(line.slice(line.indexOf('{')))))
                // Merge newly extracted Map with the accumulator Map
                return new Map([...acc, ...map])
            }, new Map());
        } else {
            // reduce() will not run on a single entry array
            const line = toSub[0];
            subs = new Map(Object.entries(JSON.parse(line.slice(line.indexOf('{')))))
        }

        // Perform substitutions
        subs.forEach((value, key) => {
            // Search for parameter assignment to change (use RegExp to allow use of variable)
            const strMatch = contents.match(new RegExp(`${key} =.*`, 'g'));
            // If parameter found then replace value for all instances 
            if (strMatch) {
                // Add quotes to any string value
                const strReplace = typeof value === 'string' ? `'${value}'` : value;
                contents = contents.replaceAll(strMatch[0], `${key} = ${strReplace};`)
            }
        });
    }
    // Always return file contents
    return contents
}

// ### Start work
try {
    // ### Derive some more constants
    const execPath = process.argv[1];
    const workingDir = execPath.slice(0, execPath.indexOf('/tools'));

    // Set source and destination paths
    //  Assume component directories are at same level as 'Node' directory (where this script is placed)
    const srcPath = `${workingDir}/${prodRepo}/dev/simon`;
    //  Files are output to 'docs' directory of staging repo
    const dstPath = `${workingDir}/${stageRepo}/docs`;

    // Clean up Stage by deleting any files/folders that no longer exist in Dev
    await myLib.delDownstream(srcPath, dstPath);

    // ### Process any parameters provided
    let paramList = process.argv.slice(2);
    //  Check if "staging type" has been provided (first param) - default to type 1
    switch (true) {
        // If no parameters then use dafault paths and set stage type to 1 via fall through
        case (paramList.length === 0):
            paramList = defaultParams;
        // If first param is NaN then assume it is a component name and set stage type to 1
        case (isNaN(parseInt(paramList[0]))):
            break;
        // If we get here then stage type has been provided
        default:
            // Set flag to first param
            stgType = parseInt(paramList[0]);
            // Remove first param from array
            paramList.shift();
            // If only "stage type" value was passed then use default paths
            if (paramList.length === 0) paramList = paramList.concat(defaultParams)
    }
    // Set HTML minifier options based on value of 'stgType'
    const miniHOpt = stgType % 2 === 0 ? miniHOpt1 : miniHOpt2;
    //  Convert parameter list to component path list 
    const compList = paramList.map(comp => {
        // Don't alter component path if it is found in defaultParams
        if (defaultParams.includes(comp)) return comp
        else return (`components/${comp}`)
    })

    // ### Pre-flight checks
    // Is "staging type" value sane?
    if (stgType < 1 || (stgType > 4 && stgType != 8)) throw new Error('Unrecognised value for "staging type"\nMust be in range 1...4', { cause: 'custom' })
    // Do all specified modules exist? Exit on first module dir not found
    await Promise.all(compList.map(async comp => {
        return fs_stat(`${srcPath}/${comp}`).catch(() => { throw new Error(`Source directory for "${comp}" not found\nExiting...`, { cause: 'custom' }) })
    }))

    // ### Main Code
    // Ensure "docs" dir exists in destination path
    try {
        // Throws an error if "dstPath" does not exist
        await fs_stat(dstPath)
    } catch {
        // Attempt to make dir
        await fs_mkdir(dstPath);
    }

    // Asynchronously process all specified components/modules and collect promises
    const waitForComps = compList.map(async comp => {
        // Recurse through component directory to generate an array of directory entry objects
        const rawFileList = await fs_readdir(`${srcPath}/${comp}`, { withFileTypes: true, recursive: true })
        // Filter out directory objects and convert remaining objects to relative file path strings
        const fileList = rawFileList.map(el => {
            // Convert directory  entries to 'undefined'
            if (!el.isDirectory()) return `${el.parentPath}/${el.name}`
        })
            // Remove 'undefined' elements from array
            .filter(el => el)
            // Convert absolute paths to relative
            .map(el => el.slice(srcPath.length))

        // Asynchronously process all entries in fileList array
        const waitForFiles = fileList.map(async file => {
            // Create required path in staging for file, if it has not been previously created
            const filePath = `${dstPath}/${file.slice(0, file.lastIndexOf('/'))}`;
            try {
                await fs_stat(filePath)
            } catch {
                await fs_mkdir(filePath, { recursive: true })
            }
            // Process file based on extension
            // Get extension for this file
            const fileType = file.slice(file.lastIndexOf('.') + 1);
            switch (fileType) {
                // Ignore .md files
                case 'md':
                    break;
                // Use uglify-js with default settings for JS
                case 'js':
                case 'mjs':
                    {
                        // Get original file contents <string>
                        let contents = await fs_readFile(`${srcPath}/${file}`, 'utf8');
                        // If substitutions has been requested then carry out the sub
                        if (stgType > 2) contents = constSub(contents);
                        // What type of minifing has been requested?
                        contents = stgType % 2 === 0 ? await minify_t(contents, miniTOpt) : minify_u(contents, miniUOpt)
                        return fs_writeFile(`${dstPath}/${file}`, contents.code);
                    }
                // Use html-minifier for HTML - options defined above
                case 'html':
                case 'htm':
                    {
                        // Read file as string
                        let contents = await fs_readFile(`${srcPath}/${file}`, 'utf8')
                        // Remove CSS style comments (minifier only removes <!-- -->)
                        contents = contents.replaceAll(/(\/\*[\w\s\#\.\'\"\*\:\{\}\;\-\,\(\)]*\*\/)/g, '')
                        // Minify to remove comments at minimum
                        contents = await minify_h(contents, miniHOpt);
                        // Write contents to new destination file
                        return fs_writeFile(`${dstPath}/${file}`, contents);
                    }
                // Copy all other file types
                default:
                    return fs_copyFile(`${srcPath}/${file}`, `${dstPath}/${file}`);
            }
        })
        // Return a promise that will be resolved once all files for this component have been processed
        return Promise.all(waitForFiles)
    })
    // Wait for all files of all specified components to be processed
    await Promise.all(waitForComps)
    myLib.customLog('finished processing')


    if (stgType == 8) {
        // Stop here if called by deploy.js - Calling script will clean up
        process.exit(0)
    } else {
        // ### Commit changes to staging and push to GitHub
        // ### This code assumes you are working on a POSIX-compliant system with Git installed
        // Options when spawning external commands
        const spawnOpts = {
            shell: '/bin/zsh',
            cwd: dstPath, // Ensure Git commands are made within staging tree
            encoding: 'utf8'
        }
        // Stage any changes made to the staging repo
        cp_exec('git add -Av', spawnOpts)

        // Commit and push new/updated/deleted files
        //  Ensure there is something new to commit
        if (cp_exec('git diff --name-only --cached | wc -l', spawnOpts) > 0) {
            myLib.customLog('Starting new push');
            myLib.customLog('commiting');
            const commitMsg = `Staging: type - ${stgType} ${new Date().toUTCString()}`;
            // commit and push to repo
            cp_exec(`git commit -m "${commitMsg}"; git push`, spawnOpts);
        } else myLib.customLog('Nothing new to push');
    }

} catch (e) {
    // Write error to stdout
    console.log((e.cause && e.cause === 'custom') ? e.message : e);
    // Allow a calling process to determine that script terminated abnormally
    process.exitCode = 1;
}
