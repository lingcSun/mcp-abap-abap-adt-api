import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { BaseHandler } from './BaseHandler';
import type { ToolDefinition } from '../types/tools';
import { performance } from 'perf_hooks';
import { readFile } from 'fs/promises';

export class ObjectSourceHandlers extends BaseHandler {
  getTools(): ToolDefinition[] {
    return [
      {
        name: 'getObjectSource',
        description: 'Retrieves source code for ABAP objects',
        inputSchema: {
          type: 'object',
          properties: {
            objectSourceUrl: { type: 'string' },
            options: { type: 'string' }
          },
          required: ['objectSourceUrl']
        }
      },
      {
        name: 'setObjectSource',
        description: 'Sets source code for ABAP objects. Use filePath for large files to avoid context overflow.',
        inputSchema: {
          type: 'object',
          properties: {
            objectSourceUrl: {
              type: 'string',
              description: 'The object source URL (e.g., /sap/bc/adt/oo/classes/zcl_example/source/main)'
            },
            source: {
              type: 'string',
              description: 'Source code content (for small files - will be included in context)'
            },
            filePath: {
              type: 'string',
              description: 'Local file path to read source from (for large files - bypasses context)'
            },
            lockHandle: {
              type: 'string',
              description: 'Lock handle obtained from lock operation'
            },
            transport: {
              type: 'string',
              description: 'Transport request number (optional)'
            }
          },
          required: ['objectSourceUrl', 'lockHandle']
        }
      }
    ];
  }

  async handle(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'getObjectSource':
        return this.handleGetObjectSource(args);
      case 'setObjectSource':
        return this.handleSetObjectSource(args);
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown object source tool: ${toolName}`);
    }
  }

  async handleGetObjectSource(args: any): Promise<any> {
    
    const startTime = performance.now();
    try {
      const source = await this.adtclient.getObjectSource(args.objectSourceUrl, args.options);
      this.trackRequest(startTime, true);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              source
            })
          }
        ]
      };
    } catch (error: any) {
      this.trackRequest(startTime, false);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get object source: ${error.message || 'Unknown error'}`
      );
    }
  }

  async handleSetObjectSource(args: any): Promise<any> {
    const startTime = performance.now();
    try {
      // Validate that either source or filePath is provided
      if (!args.source && !args.filePath) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Either source or filePath must be provided'
        );
      }

      // Validate that not both are provided
      if (args.source && args.filePath) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Cannot use both source and filePath. Use one or the other.'
        );
      }

      let sourceContent: string;

      if (args.filePath) {
        // Read from file (for large files - bypasses context)
        try {
          sourceContent = await readFile(args.filePath, 'utf-8');
          this.logger.info('Source loaded from file', { filePath: args.filePath });
        } catch (err: any) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Failed to read file ${args.filePath}: ${err.message}`
          );
        }
      } else {
        // Use provided source (for small files - from context)
        sourceContent = args.source;
      }

      await this.adtclient.setObjectSource(
        args.objectSourceUrl,
        sourceContent,
        args.lockHandle,
        args.transport
      );
      this.trackRequest(startTime, true);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'success',
              updated: true,
              sourceLoadedFrom: args.filePath ? `File: ${args.filePath}` : 'Context (direct source)'
            })
          }
        ]
      };
    } catch (error: any) {
      this.trackRequest(startTime, false);
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to set object source: ${error.message || 'Unknown error'}`
      );
    }
  }
}
