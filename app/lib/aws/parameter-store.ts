import {
  SSMClient,
  GetParameterCommand,
  GetParametersCommand,
} from '@aws-sdk/client-ssm';

interface ParameterStoreConfig {
  region?: string;
  withDecryption?: boolean;
}

class ParameterStoreService {
  private client: SSMClient;
  private withDecryption: boolean;

  constructor(config: ParameterStoreConfig = {}) {
    this.client = new SSMClient({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
    });
    this.withDecryption = config.withDecryption ?? true;
  }

  async getParameter(parameterName: string): Promise<string | null> {
    try {
      const command = new GetParameterCommand({
        Name: parameterName,
        WithDecryption: this.withDecryption,
      });

      const result = await this.client.send(command);
      return result.Parameter?.Value || null;
    } catch (error) {
      console.warn(
        `Failed to fetch parameter ${parameterName} from AWS Parameter Store:`,
        error,
      );
      return null;
    }
  }

  async getParameters(
    parameterNames: string[],
  ): Promise<Record<string, string | null>> {
    try {
      const command = new GetParametersCommand({
        Names: parameterNames,
        WithDecryption: this.withDecryption,
      });

      const result = await this.client.send(command);
      const parameters: Record<string, string | null> = {};

      parameterNames.forEach((name) => {
        parameters[name] = null;
      });

      result.Parameters?.forEach((param) => {
        if (param.Name && param.Value) {
          parameters[param.Name] = param.Value;
        }
      });

      if (result.InvalidParameters?.length) {
        console.warn('Invalid parameters:', result.InvalidParameters);
      }

      return parameters;
    } catch (error) {
      console.warn(
        'Failed to fetch parameters from AWS Parameter Store:',
        error,
      );
      return parameterNames.reduce(
        (acc, name) => {
          acc[name] = null;
          return acc;
        },
        {} as Record<string, string | null>,
      );
    }
  }
}

let defaultParameterStoreService: ParameterStoreService | null = null;

export function getParameterStoreService(
  config?: ParameterStoreConfig,
): ParameterStoreService {
  if (!defaultParameterStoreService) {
    defaultParameterStoreService = new ParameterStoreService(config);
  }
  return defaultParameterStoreService;
}

export async function getParameter(
  parameterName: string,
): Promise<string | null> {
  const service = getParameterStoreService();
  return service.getParameter(parameterName);
}

export async function getParameters(
  parameterNames: string[],
): Promise<Record<string, string | null>> {
  const service = getParameterStoreService();
  return service.getParameters(parameterNames);
}

export { ParameterStoreService };
