
import { Config } from "@shared/schema";

export const config: Config = {
  features: {
    futures: false,
    testing: true // Enable test mode
  },
  testCredentials: {
    exchange: "PSX",
    broker: "AKD", 
    marketType: "equity",
    username: "jawadfoq",
    password: "Xff89Jpw6",
    pin: "7175",
    accountNumber: "COAF3906"
  }
};

export function getConfig(): Config {
  return config;
}
