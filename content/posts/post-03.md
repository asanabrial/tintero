---
title: "Building a REST API with Node.js"
date: "2025-11-01"
tags: ["javascript", "node"]
excerpt: "Step-by-step guide to building a REST API using Node.js and the native HTTP module."
---

Node.js makes it easy to build lightweight HTTP servers and REST APIs.

## Creating a Basic Server

```javascript
const http = require("http");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ message: "Hello World" }));
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
```

## Routing

You can implement basic routing by checking `req.url` and `req.method`.

## JSON Body Parsing

Parse incoming JSON bodies by collecting chunks:

```javascript
let body = "";
req.on("data", (chunk) => { body += chunk; });
req.on("end", () => { const data = JSON.parse(body); });
```

This gives you a basic REST API foundation.


**See also:** [[Hexagonal Architecture in Practice]], [[Next.js App Router Guide]].
