import { execSync } from 'child_process';
try {
    const output = execSync('npx openclaw pairing approve telegram CYXPFK84', { encoding: 'utf8' });
    console.log(output);
} catch (error) {
    console.error(error.stdout || error.stderr || error.message);
}
