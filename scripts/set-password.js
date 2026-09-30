// Sets the admin password: npm run set-password
// The password is stored only as a salted scrypt hash in data/admin.json.
import readline from 'node:readline';
import { setPassword, MIN_PASSWORD_LENGTH } from '../lib/auth.js';

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); }; // hide typed characters
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const password = await askHidden('New admin password: ');
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}
if ((await askHidden('Repeat the password: ')) !== password) {
  console.error('The passwords do not match.');
  process.exit(1);
}
setPassword(password);
console.log('Admin password saved. Restart the server if it is running.');
