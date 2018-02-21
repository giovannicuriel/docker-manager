/* jslint node: true */
"use strict";

import express = require('express');

function b64decode(data: string): string {
  if (typeof Buffer.from === "function") {
    return Buffer.from(data, 'base64').toString();
  } else {
    return (new Buffer(data, 'base64')).toString();
  }
}

class UnauthorizedError {
  message: string;
  constructor(){
    this.message = "Authentication (JWT) required for API";
  }
}

class InvalidTokenError {
  message: string = "Invalid authentication token given";
  constructor(){}
}


/**
 * Parse authorization data and add headers to the request.
 * 
 * This function is to be added as a middleware function in express (by calling
 * app.use(authEnforce)) - it should not be called alone. 
 * 
 * It must be added before authEnforce.
 * 
 * @param req express Request object
 * @param res express Response object
 * @param next next function in queue
 */
export function authParse(req: express.Request, res: express.Response, next: express.NextFunction) {
  const rawToken = req.header('authorization');
  let tokenData = { service: "", userid: "", username: "" };
  if (rawToken !== undefined) {
    const token = rawToken!.split('.');
    if (token.length != 3) {
      console.error("got invalid request: token is malformed", rawToken);
      return res.status(401).send(new InvalidTokenError());
    }
    tokenData = JSON.parse(b64decode(token[1]));
  }
  // Make sure that these headers are always an array, so that header[0] will
  // make sense.
  // In worst case, these headers will be empty.
  req.headers["x-dojot-user"] = [tokenData.username];
  req.headers["x-dojot-userid"] = [tokenData.userid];
  req.headers["x-dojot-service"] = [tokenData.service];
  next();
}

/**
 * Checks whether authorization data is valid and correct.
 * 
 * This function is to be added as a middleware function in express (by calling
 * app.use(authEnforce)) - it should not be called alone. 
 * 
 * It must be added after authParse.
 * 
 * @param req express Request object
 * @param res express Response object
 * @param next next function in queue
 */
export function authEnforce(req: express.Request, res: express.Response, next: express.NextFunction) {
 
  if (req.headers["x-dojot-user"] === undefined || req.headers["x-dojot-user"]![0].trim() === "") {
    // valid token must be supplied
    console.error("got invalid request: user is not defined in token", req.header("authorization"));
    return res.status(401).send(new UnauthorizedError());
  }

  if (req.headers["x-dojot-service"] === undefined || req.headers["x-dojot-service"]![0].trim() === "" ) {
    // valid token must be supplied
    return res.status(401).send(new UnauthorizedError());
  }

  next();
}
