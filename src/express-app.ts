import * as express from "express";
import { Request, Response, NextFunction } from "express-serve-static-core";
import {ManagerConfiguration} from "./config";
import { DockerManagerInterface } from "./docker-manager"
import { Container, ContainerSet } from "./container"
import { authParse, authEnforce } from "./auth-middleware";
import bodyParser = require("body-parser");

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
    this.app.use(authParse);
    this.app.use(authEnforce);
    this.app.use(bodyParser.json()); // for parsing application/json
    this.app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
    
    this.dockerManager = manager;

    this.registerEndpoints();

    this.app.listen(config.port, function () {
      console.log("Docker manager listening on port " + config.port + "!");
    });
  }

  private registerEndpoints() {
    this.app.post("/start", (req: express.Request, res: express.Response) => {
      // Get authorization data to build network names
      let containerSet: ContainerSet = req.body;

      // We are sure that these x-dojot-* headers exist - authParse and 
      // authEnforce were executed.
      let networkName = req.headers["x-dojot-service"]![0] + "-" + containerSet.name;
      let answer: StartCmdResponse = {
        containerSet: containerSet,
        failedContainers: [],
        message: "ok",
        code: 200
      }
      this.dockerManager
        .setupAndRunContainerSet(containerSet, networkName)
        .done((value: ContainerSet) => {
          answer.containerSet = value;
          res.status(answer.code).send(JSON.stringify(answer));
        }, (error: string) => {
          answer.message = error;
          answer.code = 500;
          res.status(answer.code).send(JSON.stringify(answer));
        });
    });

    this.app.post("/stop", (req: express.Request, res: express.Response) => {
      let containerSetId: string = req.body["ContainerSetId"];

      let answer: StopCmdResponse = {
        failedContainers: [],
        message: "ok",
        code: 200
      }

      let finishedCbk = () => {
        res.status(answer.code).send(JSON.stringify(answer));
      }

      this.dockerManager
        .killAndRemoveContainerSet(containerSetId)
        .done(
          (value: number) => {
            res.status(answer.code).send(JSON.stringify(answer));
          },
          (error: string) => {
            answer.message = error;
            answer.code = 500;
            res.status(answer.code).send(JSON.stringify(answer));
          }
        );
    });
  }
}

export { ExpressApp }