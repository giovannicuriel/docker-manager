import util = require("util");
import fs = require("fs");

import { ManagerConfiguration } from "./config";
import { ExpressApp } from "./express-app";
import { ContainerSet, Container } from "./container";
import { DockerManager } from "./docker-manager";
import { KubernetesManager } from "./kubernetes-manager";
import { ContainerManagerFactory } from "./container-manager";

if (process.argv.length != 3) {
  console.log("Usage: " + process.argv[0] + " " + process.argv[1] + " CONFIG_FILE.json");
} else {
  try {
    let configFile = fs.readFileSync(process.argv[2]);
    let config: ManagerConfiguration = JSON.parse(configFile.toString());
    let manager = ContainerManagerFactory.create(config);
    let app = new ExpressApp(config, manager);
  } catch (e) {
    console.log("Error: " + e);
  }
}
