import util = require("util")

import { ManagerConfiguration } from "./config"
import { ExpressApp } from "./express-app"
import { ContainerSet, Container } from "./container"
import { DockerManager } from "./docker-manager";
import { KubernetesManager } from "./kubernetes-manager";

let config: ManagerConfiguration = {
  port: 5000,
  docker: {
    type: "socket",
    socket: "/var/run/docker.sock"
  },
  kubernetes: {
    url: "http://localhost:8080"
  }
}
let manager = new KubernetesManager(config);
let app = new ExpressApp(config, manager);
