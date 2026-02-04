// ----------------------------
// ### Node script to deploy a project
//
// Usage: node <pathToScript>/deploy.js [componentName] [componentName]
// 
// Code is taken from 'stage' for the specified component(s) (Default: all components & modules),
// minified and then component dir(s) in 'doc' directory are over-written.
// If any components are specified then 'modules' must also be passed to update module files (all or none) 
//
// After running this script, a commit must be done manually
//
// Dependencies:
// - uglify-js
// - html-minifier-next
// > npm install --save uglify-js html-minifier-next
// ----------------------------

// ### Load modules 
// Get FileSystem access functions
import {
    cp as fs_cp,
    mkdir as fs_mkdir,
    stat as fs_stat
} from 'fs/promises';
// Allow shell commands
import { spawnSync as cp_spawn, execSync as cp_exec } from 'child_process';
import * as myLib from './lib.js'

// ### Define constants
// Repo names
const prodRepo = 'rt-comps.github.io';
const stageRepo = 'stage';

// ### Derive some more constants
// Useful paths
const execPath = process.argv[1];
const workingDir = execPath.slice(0, execPath.indexOf('/tools'));
const srcPath = `${workingDir}/${stageRepo}`;
const dstPath = `${workingDir}/${prodRepo}`;

// Options for child processes
const spawnOpts = {
    cwd: execPath.slice(0, execPath.lastIndexOf('/')),
    encoding: 'utf8'
};
const execStgOpts = {
    cwd: srcPath,
    encoding: 'utf8'
};
const execProdOpts = {
    cwd: dstPath,
    encoding: 'utf8'
};
// Store cuurent branch for restoring state in finally {}
const currentBranch = cp_exec('git branch --show-current', execProdOpts).replace('\n', '')
myLib.customLog(currentBranch)
// ### Start work
try {
    // Sanitise any provided paramters 
    const paramList = process.argv.slice(2);
    let compList = [];
    // Remove any parameters that contain any chars apart from alphanumerics, '_' & '-'
    if (paramList.length > 0) {
        compList = paramList.map(comp => {
            if (comp.match(/^[\w\-]*$/)) return comp
        }).filter(el => el)
    };

    // Use 'stage.js' to create new minified files 
    const stageRes = cp_spawn('node', ['stage.js', '8'].concat(compList), spawnOpts);
    // Log any output from the spawned process or re-throw any error found in 'stage.js'
    if (stageRes.status === 0) console.log(stageRes.stdout);
    else throw new Error(`\n** Error in "stage.js" **\n\n${stageRes.stdout}`, { cause: 'custom' });

    // Examine staging to find the components that contain changed files as some files don't change when minified
    // so need to copy dirs rather than individual files
    //  Get list of files that have changed (includes path), convert list to array and filter out any falsey values
    const changedFiles = cp_exec('git diff --name-only', execStgOpts).split('\n').filter(el => el);
    //  Convert entries to paths only and remove any duplicate paths
    const changedDirs = [...new Set(changedFiles.map(el => el.slice(0, el.lastIndexOf('/'))))];
    //  Remove any sub directories from list
    changedDirs.forEach((el, idx, arr) => {
        // Search the array for another path that start with this path, ie sub-directories
        const other = arr.findIndex((elem, index) => elem.indexOf(`${el}/`) > -1 && index !== idx);
        // If a sub-directory is found then remove it from array as any sub-dirs will be overwritten when new enclosing dir is copied
        if (other > -1) arr.splice(other, 1);
    });

    // Stash 'dirty' files and switch to Release branch        
    cp_exec('git stash -u; git checkout Release', execProdOpts);
    // Pull in working directory to Release branch
    cp_exec(`git merge --no-ff ${currentBranch}`, execProdOpts);

    // Copy all new files to Release branch
    const waitForFiles = changedDirs.map(async dir => fs_cp(`${srcPath}/${dir}/`, `${dstPath}/${dir}/`, { recursive: true }));
    await Promise.all(waitForFiles);

    // Stage any changes made in Release
    cp_exec('git add -Av', execProdOpts);
    // Commit any changes to Release
    if (cp_exec('git diff --name-only --cached | wc -l', execProdOpts) > 0) {
        myLib.customLog('Starting new push');
        myLib.customLog('commiting')
        const commitMsg = `New Release: ${new Date().toUTCString()}\n\nComponents Updated:\n${changedDirs.map(dir => {
            return dir.slice('docs/'.length)
        }).join('\n')}`
        cp_exec(`git commit -m "${commitMsg}"`, execProdOpts)
        // cp_exec('git push', execProdOpts)
    } else myLib.customLog('No files have changed\n');

} catch (e) {
    // Print the error...
    myLib.customLog((e.cause && e.cause === 'custom') ? e.message : e);
    // And reset Release branch to last commit
    cp_exec('git reset --hard', execProdOpts);
} finally {
    myLib.customLog('tidying up\n');
    // Tidy up
    //  Reset staging to last commit
    cp_exec('git reset --hard', execStgOpts);
    //  Restore repo to previous state
    cp_exec(`git checkout ${currentBranch}`, execProdOpts);
    if (cp_exec(`git stash list | wc -l`, execProdOpts) > 0) cp_exec(`git stash pop`, execProdOpts);
}
