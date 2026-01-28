
import {
    readdir as fs_readdir,
    rm as fs_rm
} from 'fs/promises';

// Check for files/dirs in destination that no longer exist in source
//  returns a promise that file deletions will complete
async function delDownstream(srcPath, dstPath) {

    // Get list of folder contents for source and destination
    const srcList = await fs_readdir(srcPath, { withFileTypes: true, recursive: true });
    const dstList = await fs_readdir(dstPath, { withFileTypes: true, recursive: true });
    // Get list of dirs in source
    const srcDirs = srcList
        // Get directories as relative path
        .filter(el => el.isDirectory())
        // Convert Dirent to path string
        .map(el => `${el.parentPath}/${el.name}`
            // Split string on srcPath into array
            .split(srcPath)
            // Relative path will be last entry in array
            .pop()
        );
    // Do the same for desination
    const dstDirs = dstList
        .filter(el => el.isDirectory())
        .map(el => `${el.parentPath}/${el.name}`
            .split(dstPath)
            .pop()
        );
    // Find directories that only exist in destination
    const deleteDirs = dstDirs.filter(el => !srcDirs.includes(el));
    // Remove directories from destination that do not exist in source
    const waitForDirDelete = deleteDirs.map(async el => {
        console.log(`Deleting directory "${dstPath}${el}"`);
        return fs_rm(`${dstPath}${el}`, { recursive: true, force: true })
    })
    // Let all dir deletions complete
    await Promise.all(waitForDirDelete);

    // Now get list of files
    // Destination may have changed so need to re-read destination dir
    const dstList2 = await fs_readdir(dstPath, { withFileTypes: true, recursive: true });
    const dstFiles = dstList2
        .filter(el => el.isFile())
        .map(el => `${el.parentPath}/${el.name}`
            .split(dstPath)
            .pop()
        );
    // Source should be unchanged so can just process re-process for files
    const srcFiles = srcList
        .filter(el => el.isFile())
        .map(el => `${el.parentPath}/${el.name}`
            .split(srcPath)
            .pop()
        );
    // Find files that only exist in destination
    const deleteFiles = dstFiles.filter(el => !srcFiles.includes(el));
    // Remove files from destination that no longer exist in source
    const waitForFileDelete = deleteFiles.map(async el => {
        console.log(`Deleting file "${dstPath}${el}"`);
        return fs_rm(`${dstPath}${el}`)
    });
    // Return deletion promises
    return Promise.all(waitForFileDelete);
}

function customLog() {
    // Throw a new error at point function is called
    const err = new Error();
    // 3rd line  of stack provides the file and line number where function was called
    const stack = err.stack.split('\n')[2];
    // Manipulate string to create array of form [ <filename>, <line number>, <column number> ]
    const matchResult = stack.split('/').pop().split(':')
    // Output this line and concatenate all arguments
    console.log(`[${matchResult[0]}:${matchResult[1]}] - ${[...arguments].join(' : ')}`);
}

export {
    delDownstream,
    customLog
};
