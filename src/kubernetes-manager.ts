import { ContainerManagerInterface } from "./docker-manager";
import { ContainerSet } from "./container";
import Api = require("kubernetes-client");
import { ManagerConfiguration } from "./config";
import util = require("util");
import when = require("when");
import yaml = require("js-yaml");
import fs = require("fs");

interface K8sMetadata {
  [attribute : string] : any;
}

interface K8sSpec {
  [attribute : string] : any;
}

interface K8sManifest {
  apiVersion: "extensions/v1beta1",
  kind: "Namespace" | "Deployment",
  metadata: K8sMetadata,
  spec: K8sSpec,

}
        
interface ContainerTemplate {
  image: string;
  imagePullPolicy: "Never",
  name: string;
}

class KubernetesManager implements ContainerManagerInterface {
  host: string;
  token: string;
  constructor(config: ManagerConfiguration) {
    console.log("Using kubernetes driver.");
    if (config.engine == "kubernetes" && config.kubernetes) {
        this.host = config.kubernetes.url;
        this.token = config.kubernetes.token;
    } else {
      // Throw exception or return error
        this.token = "";
        this.host = "";
    }
  }

  setupAndRunContainerSet(containerSet: ContainerSet, namespace: string): When.Promise<ContainerSet> {
    return when.promise((resolve, reject) => {
      console.log(`Setting up and running containers...`);
      console.log(`Container set is: ${util.inspect(containerSet, {depth: null})}`);
      let deploymentObj: K8sManifest = {
        apiVersion: "extensions/v1beta1",
        kind: "Deployment",
        metadata: {
          labels: {
            name: containerSet.name
          },
          name: containerSet.name
        },
        spec: {
          replicas: 1,
          template: {
            metadata: {
              labels: {
                name: containerSet.name
              }
            },
            spec: {
              containers:[
              ],
              restartPolicy: "Always"
            }
          }
        }
      }
      console.log(`Adding all containers`);
      for (let container of containerSet.containers) {
          console.log(`Adding container ${container.name} to the set...`);
          let containerTemplate: ContainerTemplate = {
            name: container.name,
            image: container.image,
            imagePullPolicy: "Never"
          }
          deploymentObj.spec.template.spec.containers.push(containerTemplate);
          console.log(`... container ${container.name} was added to the set.`);
      }

      console.log(`Creating request...`);
      const apiGroupOptions: Api.ApiGroupOptions = {
        url: this.host,
        version: 'v1beta1',  // Defaults to 'v1beta1',
        auth: {
          bearer: this.token
        },
        insecureSkipTlsVerify: true,
      }

      const ext = new Api.Extensions(apiGroupOptions);
      console.log(`API group options: ${util.inspect(apiGroupOptions, {depth: null})}`);
      console.log(`... request created.`);

      console.log(`Sending request to server...`);
      ext.namespaces!("dojot").deployments!.post({ body: deploymentObj}, (error, value) => {
        console.log("Error: " + util.inspect(error, {depth: null}));
        console.log("Value: " + util.inspect(value, {depth: null}));
        if (error == null) {
          resolve(containerSet);
        } else {
          reject(error);
        }
      });
      console.log(`... request was sent to the server.`);
    });
  }

  killAndRemoveContainerSet(containerSetId: string): When.Promise<number> {
    return when.promise((resolve, reject) => {
      const ext = new Api.Extensions({
        url: this.host,
        version: 'v1beta1'  // Defaults to 'v1beta1'
      });

      ext.namespaces!("dojot").deployments!(containerSetId).delete({ }, (error, value) => {
        console.log("Error: " + util.inspect(error, {depth: null}));
        console.log("Value: " + util.inspect(value, {depth: null}));
        if (error == null) {
          resolve(0);
        } else {
          reject(error);
        }
      });
    });
  }
}

export { KubernetesManager };