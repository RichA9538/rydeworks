FROM node:22-alpine

WORKDIR /app

CMD ["node", "-e", "const h=require('http');h.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'ok'}))}).listen(parseInt(process.env.PORT)||3000,'0.0.0.0',()=>{console.log('[test] Listening on port',process.env.PORT||3000)})"]
