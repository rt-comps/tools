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
    copyFile as fs_copyFile,
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
const workingDir = execPath.slice(0, execPath.indexOf(prodRepo));
const srcPath = `${workingDir}${stageRepo}`;
const dstPath = `${workingDir}${prodRepo}`;
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
    }

    // Use 'stage.js' to create new minified files 
    const stageRes = cp_spawn('node', ['stage.js', '8'].concat(compList), spawnOpts);
    console.log(stageRes.stdout)
    // Re-throw any error found in 'stage.js'
    if (stageRes.status != 0) throw new Error(`\n** Error in "stage.js" **\n\n${stageRes.stdout}`, { cause: 'custom' });

    // Stash 'dirty' files and switch to Release branch        
    cp_exec('git stash -u; git checkout Release', execProdOpts);
    process.exit()
    // Pull in working directory to Release branch
    cp_exec(`git merge --no-ff ${currentBranch}`, execProdOpts);
    
    // Get list of changed files in staging repo (filter out empty lines)
    const newFiles = cp_exec('git diff --name-only', execStgOpts).split('\n').filter(el => el);

    // Ensure all destinations exist
    const checkDirs = newFiles.map(async file => {
        const filePath = `${dstPath}/${file.slice(0, file.lastIndexOf('/'))}`;
        // If file path does not exist in production (error thrown) then create it
        try {
            await fs_stat(filePath);
        } catch {
            await fs_mkdir(filePath, { recursive: true });
        }
    });
    await Promise.all(checkDirs);
    // Copy all new files to Release branch
    const waitForFiles = newFiles.map(async file => {
        // Don't process any empty (falsey) values
        if (file) {
            return fs_copyFile(`${srcPath}/${file}`, `${dstPath}/${file}`)
        }
    });
    // Wait for all copy process to complete before continuing
    await Promise.all(waitForFiles);

    // Stage any changes made in Release
    cp_exec('git add -Av', execProdOpts);
    // Commit any changes to Release
    if (cp_exec('git diff --name-only --cached | wc -l', execProdOpts) > 0) {
        myLib.customLog('Starting new push');
        myLib.customLog('commiting')
        const commitMsg = `New Release: ${new Date().toUTCString()}\n\nFiles Updated:\n${newFiles.map(file => {
            return file.slice('docs/'.length)
        }).join('\n')}`
        cp_exec(`git commit -m "${commitMsg}"`, execProdOpts)
        cp_exec('git push', execProdOpts)
    } else myLib.customLog('No files have changed\n');

} catch (e) {
    myLib.customLog(e)
    myLib.customLog('\nGOT AN ERROR\n')
    myLib.customLog((e.cause && e.cause === 'custom') ? e.message : e);
    // Reset Release to last commit
    // cp_exec('git reset --hard', execProdOpts);
} finally {
    myLib.customLog('tidying up\n');
    // Tidy up
    //  Reset staging to last commit
    // cp_exec('git reset --hard', execStgOpts);
    // // Restore repo to previous state
    // cp_exec(`git checkout ${currentBranch}`, execProdOpts); 
    // if (cp_exec(`git stash list | wc -l`,execProdOpts) > 0) cp_exec(`git stash pop`, execProdOpts);
}
