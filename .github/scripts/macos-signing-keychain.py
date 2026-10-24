"""Import CI-only signing credentials; always run cleanup after the build."""
import base64
import json
import os
from pathlib import Path
import secrets
import shlex
import shutil
import subprocess
import sys


def run(args):
    result = subprocess.run(args, capture_output=True)
    if result.returncode:
        # Security commands include passwords in argv: never print arguments or exceptions.
        raise RuntimeError(f'{args[0]} {args[1]} failed (exit {result.returncode}).')
    return result.stdout.decode().strip()


def setup(directory):
    required = ['MACOS_DEVELOPER_ID_P12_BASE64', 'MACOS_DEVELOPER_ID_P12_PASSWORD',
                'APPLE_API_PRIVATE_KEY_P8_BASE64', 'APPLE_TEAM_ID', 'ELECTROBUN_DEVELOPER_ID',
                'APPLE_API_KEY_ID', 'APPLE_API_ISSUER_ID']
    for name in required:
        if not os.environ.get(name):
            raise RuntimeError(f'Missing required release secret: {name}')
        if '\n' in os.environ[name] or '\r' in os.environ[name]:
            raise RuntimeError(f'Unexpected multiline secret: {name}')
    identity = os.environ['ELECTROBUN_DEVELOPER_ID']
    if not identity.startswith('Developer ID Application: ') or not identity.endswith(f"({os.environ['APPLE_TEAM_ID']})"):
        raise RuntimeError('Signing identity does not match the release team.')
    directory.mkdir(mode=0o700)
    original = shlex.split(run(['security', 'list-keychains', '-d', 'user']))
    (directory / 'original-keychains.json').write_text(json.dumps(original))
    p12 = directory / 'certificate.p12'
    api_key = directory / 'AuthKey.p8'
    for path, name in [(p12, 'MACOS_DEVELOPER_ID_P12_BASE64'), (api_key, 'APPLE_API_PRIVATE_KEY_P8_BASE64')]:
        path.write_bytes(base64.b64decode(os.environ[name], validate=True))
        path.chmod(0o600)
    keychain = str(directory / 'signing.keychain-db')
    password = secrets.token_urlsafe(32)
    run(['security', 'create-keychain', '-p', password, keychain])
    run(['security', 'set-keychain-settings', '-lut', '21600', keychain])
    run(['security', 'unlock-keychain', '-p', password, keychain])
    run(['security', 'import', str(p12), '-k', keychain, '-P', os.environ['MACOS_DEVELOPER_ID_P12_PASSWORD'], '-T', '/usr/bin/codesign'])
    run(['security', 'set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', password, keychain])
    run(['security', 'list-keychains', '-d', 'user', '-s', keychain, *original])
    if identity not in run(['security', 'find-identity', '-v', '-p', 'codesigning', keychain]):
        raise RuntimeError('Requested signing identity was not imported.')
    p12.unlink()
    with open(os.environ['GITHUB_ENV'], 'a') as target:
        for name, value in {
            'BLOOMMD_MACOS_RELEASE': '1',
            'ELECTROBUN_DEVELOPER_ID': identity,
            'APPLE_TEAM_ID': os.environ['APPLE_TEAM_ID'],
            'ELECTROBUN_APPLEAPIKEY': os.environ['APPLE_API_KEY_ID'],
            'ELECTROBUN_APPLEAPIISSUER': os.environ['APPLE_API_ISSUER_ID'],
            'ELECTROBUN_APPLEAPIKEYPATH': str(api_key),
        }.items():
            target.write(f'{name}={value}\n')
    print('Temporary signing keychain configured.')


def cleanup(directory):
    if not directory.exists():
        return
    try:
        original = directory / 'original-keychains.json'
        if original.exists():
            run(['security', 'list-keychains', '-d', 'user', '-s', *json.loads(original.read_text())])
    finally:
        try:
            keychain = directory / 'signing.keychain-db'
            if keychain.exists():
                run(['security', 'delete-keychain', str(keychain)])
        finally:
            shutil.rmtree(directory)
    print('Temporary signing credentials removed.')


if __name__ == '__main__':
    try:
        directory = Path(os.environ['RUNNER_TEMP']) / 'bloommd-macos-signing'
        if sys.argv[1:] == ['setup']:
            setup(directory)
        elif sys.argv[1:] == ['cleanup']:
            cleanup(directory)
        else:
            raise RuntimeError('Usage: macos-signing-keychain.py setup|cleanup')
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
