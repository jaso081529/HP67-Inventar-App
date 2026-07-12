import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT) || 8080;
const root = process.cwd();
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};

createServer(async (req,res)=>{
  try{
    const urlPath = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const relative = normalize(urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/,''));
    if(relative.startsWith('..')) throw new Error('Ungültiger Pfad');
    const file = join(root,relative);
    const body = await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});
    res.end(body);
  }catch{
    res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});
    res.end('Nicht gefunden');
  }
}).listen(port,()=>console.log(`HP67 Inventar läuft auf http://localhost:${port}`));
