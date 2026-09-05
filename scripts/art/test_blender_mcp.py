"""Verify the actual STDIO MCP handshake and its Blender tool, not just config."""
import asyncio
import json
import sys
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    script=Path(__file__).with_name('blender_mcp.py')
    params=StdioServerParameters(command='/opt/homebrew/bin/uv',args=['run','--with','mcp==1.26.0','python',str(script)])
    async with stdio_client(params) as (read,write):
        async with ClientSession(read,write) as session:
            await session.initialize()
            listing=await session.list_tools()
            assert {t.name for t in listing.tools} == {'inspect_tiny_world_assets','build_tiny_world_assets'}
            result=await session.call_tool('inspect_tiny_world_assets',{})
            assert not result.isError
            if '--build' in sys.argv:
                result=await session.call_tool('build_tiny_world_assets',{})
                assert not result.isError
            receipt={'tools':[t.name for t in listing.tools], 'result':result.model_dump(mode='json')}
            (script.parents[2]/'art/blender-mcp-verification.json').write_text(json.dumps(receipt,indent=2)+'\n')
            print(json.dumps({'tools':receipt['tools'],'status':'passed','build':'--build' in sys.argv}))

asyncio.run(main())
