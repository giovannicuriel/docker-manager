/* jslint node: true */
"use strict";

import express = require('express');
import { Request, Response, NextFunction } from 'express-serve-static-core';

function b64decode(data: string): string {
  if (typeof Buffer.from === "function") {
    return Buffer.from(data, 'base64').toString();
  } else {
    return (new Buffer(data, 'base64')).toString();
  }
}

export interface AuthRequest {
  user: string;
  userid: string;
  service: string;
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

export function authParse(req: express.Request, res: express.Response, auth: AuthRequest): express.Response | null {
  const rawToken = req.header('authorization');
  if (rawToken === undefined) {
    return res.status(401).send(new UnauthorizedError());
  }

  const token = rawToken!.split('.');
  if (token.length != 3) {
    console.error("got invalid request: token is malformed", rawToken);
    return res.status(401).send(new InvalidTokenError());
  }

  const tokenData = JSON.parse(b64decode(token[1]));

  auth.user = tokenData.username;
  auth.userid = tokenData.userid;
  auth.service = tokenData.service;
  return null;
}

