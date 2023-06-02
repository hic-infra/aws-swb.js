# aws-swb.js
A node-fetch based API client for Service Workbench

## Usage

The library can be added as a dependency using npm,

```bash
npm add --save https://github.com/hic-infra/aws-swb.js.git
```

which will then allow you to interact with AWS Service Workbench.

```js
import SWB from 'aws-swb';

# Currently only supports 'internal' scheme authentication.
const swbUsername = '';
const swbPassword = '';

# This refers to the API endpoint hosted by Amplify.
const swbUrl = '';

# Create a SWB object and do some testing.
var swb = new SWB(swbUrl, swbUsername, swbPassword);
var me = await swb.login();

# Add a uid to a project
swb.addRemoveProjectUser('project-1234', 'u-XXXXXXXX', 'add')
  .then(r = {
    console.log('User added to project');
  });

```

Still a bit messy, still a work in progress, contributions, fixes,
etc, all wecome.

