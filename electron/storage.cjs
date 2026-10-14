const fs=require('node:fs');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const ignored=new Set(['Cache','Code Cache','GPUCache','DawnGraphiteCache','DawnWebGPUCache','Crashpad','ShaderCache','GrShaderCache','LOCK','SingletonLock','SingletonSocket','SingletonCookie']);
function inside(parent,child){const relative=path.relative(parent,child);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}
function absolute(value){if(typeof value!=='string'||!path.isAbsolute(value)||/[\r\n\0]/.test(value))throw new Error('请选择有效的绝对文件夹路径。');return path.resolve(value);}
function canonical(value){let base=absolute(value),tail=[];while(!fs.existsSync(base)){tail.unshift(path.basename(base));const next=path.dirname(base);if(next===base)break;base=next;}return path.join(fs.realpathSync(base),...tail);}
function readIni(filename){if(!fs.existsSync(filename))return {};const bytes=fs.readFileSync(filename);if(bytes.length>65536)throw new Error('存储位置配置无效。');const text=bytes[0]===255&&bytes[1]===254?bytes.subarray(2).toString('utf16le'):bytes.toString('utf8').replace(/^\uFEFF/,'');let active=false,result={};for(const line of text.split(/\r?\n/)){if(/^\[.+\]$/.test(line.trim())){active=line.trim().toLowerCase()==='[storage]';continue;}if(active){const index=line.indexOf('=');if(index>0)result[line.slice(0,index).trim().toLowerCase()]=line.slice(index+1).trim();}}return result;}
function writeIni(filename,current,pending=''){fs.mkdirSync(path.dirname(filename),{recursive:true});const temp=filename+'.tmp';const text=`[Storage]\r\nCurrent=${absolute(current)}\r\nPending=${pending?absolute(pending):''}\r\n`;try{fs.writeFileSync(temp,Buffer.concat([Buffer.from([255,254]),Buffer.from(text,'utf16le')]),{mode:0o600});fs.renameSync(temp,filename);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
function bytesIn(directory){if(!fs.existsSync(directory))return 0;let size=0;for(const item of fs.readdirSync(directory,{withFileTypes:true})){const filename=path.join(directory,item.name);if(item.isSymbolicLink())continue;if(item.isDirectory())size+=bytesIn(filename);else size+=fs.statSync(filename).size;}return size;}
function createStorage({configPath,fallbackPath,installationPath}){
 configPath=absolute(configPath);fallbackPath=absolute(fallbackPath);installationPath=absolute(installationPath);
 const saved=readIni(configPath);let current=saved.current?absolute(saved.current):fallbackPath,pending=saved.pending?absolute(saved.pending):'',lastError='';
 if(current===path.parse(current).root)throw new Error('数据目录不能是磁盘根目录。');
 fs.mkdirSync(current,{recursive:true});
 function validate(target){target=absolute(target);const resolved=canonical(target),source=canonical(current),install=canonical(installationPath);if(resolved===path.parse(resolved).root||inside(source,resolved)||inside(resolved,source))throw new Error('新目录不能是原目录、其上级目录或子目录。');if(inside(install,resolved))throw new Error('数据位置请与软件安装目录分开，避免卸载时删除记录。');if(fs.existsSync(target)&&(!fs.statSync(target).isDirectory()||fs.readdirSync(target).length))throw new Error('请选择空文件夹，已有文件不会被覆盖。');return target;}
 function info(){return {path:current,dataPath:path.join(current,'Local Storage','leveldb'),pendingPath:pending,bytes:bytesIn(path.join(current,'Local Storage')),error:lastError};}
 function choose(target){pending=validate(target);writeIni(configPath,current,pending);return info();}
 function cancel(){writeIni(configPath,current);pending='';return info();}
 function migratePending(){if(!pending)return false;const target=validate(pending),parent=path.dirname(target),stage=target+'.planner-migrate-'+randomUUID();
  // All recursive operations are limited to this checked staging sibling of the selected target.
  if(path.dirname(stage)!==parent||!path.basename(stage).startsWith(path.basename(target)+'.planner-migrate-'))throw new Error('迁移临时目录无效。');
  fs.mkdirSync(parent,{recursive:true});fs.mkdirSync(stage);
  try{
   const copy=(source,destination)=>{for(const item of fs.readdirSync(source,{withFileTypes:true})){const from=path.join(source,item.name),to=path.join(destination,item.name);if(ignored.has(item.name)||path.resolve(from)===configPath||item.name==='storage-location.ini.tmp')continue;if(item.isSymbolicLink())throw new Error('数据目录包含链接，请选择普通文件夹。');if(item.isDirectory()){fs.mkdirSync(to);copy(from,to);}else{fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);if(createHash('sha256').update(fs.readFileSync(from)).digest('hex')!==createHash('sha256').update(fs.readFileSync(to)).digest('hex'))throw new Error('迁移文件校验失败。');}}};
   copy(current,stage);validate(target);if(fs.existsSync(target))fs.rmdirSync(target);fs.renameSync(stage,target);writeIni(configPath,target);current=target;pending='';return true;
  }catch(error){if(fs.existsSync(stage)&&path.dirname(path.resolve(stage))===parent)fs.rmSync(stage,{recursive:true,force:true});lastError=error.message;throw error;}
 }
 return {info,choose,cancel,migratePending,configPath};
}
module.exports={createStorage,readIni,writeIni};
