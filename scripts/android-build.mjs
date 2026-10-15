import {spawnSync} from 'node:child_process';
import {copyFileSync,existsSync,mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const variant=process.argv[2]||'debug';
if(!['debug','release'].includes(variant))throw new Error('Use debug or release.');
const win=process.platform==='win32';
const javaHome=process.env.JAVA_HOME;
if(!javaHome||!existsSync(resolve(javaHome,'bin',win?'java.exe':'java'))){
 throw new Error('Set JAVA_HOME to a JDK 21 installation (Android Studio includes one).');
}
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
if(!sdk&&!existsSync('android/local.properties'))throw new Error('Set ANDROID_HOME to your Android SDK or configure android/local.properties.');
const command=win?'gradlew.bat':'./gradlew';
// All command arguments are fixed; no paths or signing secrets are placed in a shell command.
const tasks=[variant==='debug'?'assembleDebug':'assembleRelease','lint'+(variant==='debug'?'Debug':'Release'),'--console=plain'];
const result=spawnSync(win?'cmd.exe':command,win?['/d','/s','/c',`${command} ${tasks.join(' ')}`]:tasks,{cwd:resolve('android'),env:process.env,stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status||1);
const version=JSON.parse(readFileSync('package.json','utf8')).version;
const outputDirectory=resolve(`android/app/build/outputs/apk/${variant}`);
const metadata=JSON.parse(readFileSync(resolve(outputDirectory,'output-metadata.json'),'utf8'));
const outputs=metadata.elements?.map(element=>element.outputFile).filter(name=>typeof name==='string'&&/^[\w.-]+\.apk$/.test(name));
if(outputs?.length!==1)throw new Error('Expected one APK in the current Gradle output metadata.');
const input=resolve(outputDirectory,outputs[0]);
if(!existsSync(input))throw new Error('Gradle finished without the expected APK. Check android/app/build/outputs.');
mkdirSync('release',{recursive:true});
const suffix=variant==='release'&&outputs[0].endsWith('-unsigned.apk')?'release-unsigned':variant;
const target=resolve(`release/ChongChongChong-${version}-Android-${suffix}.apk`);
copyFileSync(input,target);
console.log(`Android APK: ${target}`);
if(suffix==='release-unsigned')console.log('Sign this APK with your private release key before installing or distributing it.');
