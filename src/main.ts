import util = require("util")

import { ManagerConfiguration } from "./config"
import { ExpressApp } from "./express-app"
import { ContainerSet, Container } from "./container"
import { DockerManager } from "./docker-manager";

let config: ManagerConfiguration = {
  port: 5000,
  docker: {
    type: "socket",
    socket: "/var/run/docker.sock"
  }
}
let manager = new DockerManager(config);
let app = new ExpressApp(config, manager);
