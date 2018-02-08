import * as express from 'express';
import { Request, Response, NextFunction } from 'express-serve-static-core';
import {ManagerConfiguration} from "./config";
import { DockerManagerInterface } from "./docker-manager"
import { Container, ContainerSet } from "./container"
import { AuthRequest, authParse } from "./auth-middleware";
import bodyParser = require('body-parser');

interface StartCmdResponse {
  containerSet: ContainerSet;
  failedContainers: string[];
  message: string;
  code: number;
}

interface StopCmdResponse {
  failedContainers: string[];
  message: string;
  code: number;
}

/**
 * Express application
 */
class ExpressApp {
  private app: express.Express;
  private dockerManager: DockerManagerInterface;

  constructor(config: ManagerConfiguration, manager: DockerManagerInterface) {
    this.app = express();
    this.app.use(bodyParser.json()); // for parsing application/json
    this.app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
    
    this.dockerManager = manager;

    this.registerEndpoints();

    this.app.listen(config.port, function () {
      console.log('Docker manager listening on port {}!', config.port);
    });
  }

  private registerEndpoints() {
    this.app.post('/start', (req: express.Request, res: express.Response) => {
      // Get authorization data to build network names
      let auth: AuthRequest = {
        service: "",
        user: "",
        userid: ""
      }

      // Authorization stuff
      let response = authParse(req, res, auth);
      if (response != null) {
        return;
      }

      let containerSet: ContainerSet = req.body;
      let networkName = auth.service + "-" + containerSet.name;
      let answer: StartCmdResponse = {
        containerSet: containerSet,
        failedContainers: [],
        message: "ok",
        code: 200
      }

      let networkFailureCbk = (networkId: string, error: string) => {
        answer.message = "Could not create network";
        answer.code = 500;
      }

      let createFailureCbk = (container: Container, error: string) => {
        answer.message = "Could not create a container";
        answer.failedContainers.push(container.name);
        answer.code = 500;
      }
      
      let startFailureCbk = (container: Container, error: string) => {
        answer.message = "Could not start a container";
        answer.failedContainers.push(container.name);
        answer.code = 500;
      }

      let finishedCbk = (containerSet: ContainerSet) => {
        answer.containerSet = containerSet;
        res.status(answer.code).send(JSON.stringify(answer));
      }

      this.dockerManager.setupAndRunContainerSet(containerSet, networkName, 
          networkFailureCbk, createFailureCbk, startFailureCbk, finishedCbk);
    });

    this.app.post('/stop', (req: express.Request, res: express.Response) => {
      // Get authorization data to build network name
      let auth: AuthRequest = {
        service: "",
        user: "",
        userid: ""
      }

      // Authorization stuff
      let response = authParse(req, res, auth);
      if (response != null) {
        return;
      }

      let containerSetId: string = req.body["ContainerSetId"];

      let answer: StopCmdResponse = {
        failedContainers: [],
        message: "ok",
        code: 200
      }

      let networkFailureCbk = (networkId: string, error: string) => {
        answer.message = "Could not remove network";
        answer.code = 500;
      }

      let killFailureCbk = (container: Container, error: string) => {
        answer.message = "Could not kill a container";
        answer.failedContainers.push(container.name);
        answer.code = 500;
      }

      let finishedCbk = () => {
        res.status(answer.code).send(JSON.stringify(answer));
      }

      this.dockerManager.killAndRemoveContainerSet(containerSetId, 
          killFailureCbk, networkFailureCbk, finishedCbk);
    });
  }
}

export { ExpressApp }