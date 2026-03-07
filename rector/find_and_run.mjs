import { execSync } from 'child_process';
import { existsSync } from 'fs';

const paths = [
    '/app/node_modules/.bin/openclaw',
    '/root/node_modules/.bin/openclaw',
    '/Users/shijas/bnb ai agnt/node_modules/.bin/openclaw',
    './node_modules/.bin/openclaw'
];

for (const path of paths) {
    if (existsSync(path)) {
        console.log(`Found openclaw at ${path}`);
        try {
            const output = execSync(`${path} pairing approve telegram CYXPFK84`, { encoding: 'utf8' });
            console.log(output);
            process.exit(0);
        } catch (e) {
            console.error(`Failed to run ${path}: ${e.message}`);
        }
    }
}

console.error('Could not find openclaw binary in common locations.');
process.exit(1);
