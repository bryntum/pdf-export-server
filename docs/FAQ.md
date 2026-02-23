# Frequently Asked Questions

## Does it support authentication?

No, this project does not implement any kind of authentication.

## Does it support external/cloud storage?

No, this project does not implement any kind of external storage. Files are stored locally or in memory for a one-time
use.

### Exported PDF/PNG doesn't look correct

Most likely server couldn't get access to the resources. See [architecture](architecture.md) guide for detailed
information, [resources section](#CORS) for short summary and [troubleshooting](troubleshooting.md) guide for
debugging tips.

### PDF/PNG file is not generated

Most likely there is a problem on the server, see [troubleshooting](troubleshooting.md) guide for help.

### Cannot export using HTTPS

You can see errors like `NET::ERR_CERT_AUTHORITY_INVALID` or CORS exception (in Firefox). See
[Make browser to accept self-signed certificate](building.md#self-signed-certificate) section for more info.
