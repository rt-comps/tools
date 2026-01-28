import * as fs from 'fs';

try {
    // ### Derive some constants
    //  Get current working directory of this executable
    const workingDir = process.argv[1].slice(0, process.argv[1].lastIndexOf('/'));
    //  Ensure script has been called from within project directory else throw error
    if (!workingDir.includes('github.io')) throw new Error('No project directory found.  Ensure script is run from within project directory structure', { cause: 'custom' });
    //  Files are placed in 'components' dev directory
    const dstPath = workingDir.replace('/Node', '/components');
    //  Recover name of new component
    const compName = process.argv[2];

    // ### Pre-Flight Checks
    //Exit if no parameter provided
    if (!compName)
        throw new Error('No component name specified.', { cause: 'custom' });
    if (fs.existsSync(`${dstPath}/${compName}`))
        throw new Error(`Component with name ${compName.toUpperCase()} already exists`, { cause: 'custom' })
    // ### End of Pre-Flight Checks

    // Create new directory
    const newDir = `${dstPath}/${compName}`
    fs.mkdirSync(newDir);
    // Get template file names
    const templates = fs.readdirSync(`${workingDir}/templates`);
    // Create new files with filename reflecting new component name
    templates.forEach(filename => {
        // Read template file contents
        let contents = fs.readFileSync(`${workingDir}/templates/${filename}`, 'utf8');
        // Replace <compName> with component name in HTML file 
        if (filename.includes('.html')) contents = contents.replace('<compName>',compName.toUpperCase());
        // Write contents to new file
        fs.writeFileSync(`${newDir}/${filename.replace('comp', compName)}`, contents, 'utf8');
    })

} catch (e) {
    console.log((e.cause && e.cause === 'custom') ? e.message : e);
    process.exitCode=1;
}