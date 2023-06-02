import fetch from "node-fetch";

/**
 * @description API client for Service Workbench
 * class module:SWB
 */
class SWB {
    #password;
    #token;

    // cache of authentication providers
    #authProviders;

    authenticated = false;
    dryrun = false;

    /**
     * Creates a new instance of SWB
     *
     * @param {string} api - The API address for SWB
     * @param {string} username - The username of an admin account
     * @param {string} password - The password of an admin account
     *
     * @returns {SWB}
     */
    constructor(api, username, password) {
	this.api = api;
	this.username = username;
	this.#password = password;
    }

    /**
     * Performs a login request against Service Workbench. The
     * username and passwould should be provided to the constructor.
     *
     * @returns {Promise<User>}
     */
    async login() {
	const body = {
	    username: this.username,
	    password: this.#password,
	    authenticationProvider: "internal",
	};

	return new Promise((resolve, reject) => {
	    fetch(
		`${this.api}/api/authentication/id-tokens`,
		{
		    'headers': {
			'Content-Type': 'application/json'
		    },
		    'body': JSON.stringify(body),
		    'method': 'POST',
		})
		.then(response => {
		    if (response.status !== 200) throw new Error('authentication failed');
		    return response.json()
		})
		.then(auth => {
		    this.#token = auth.idToken;

		    fetch(
			`${this.api}/api/user`,
			{
			    'headers': {
				'Content-Type': 'application/json',
				'Authorization': this.#token,
			    },
			    'method': 'GET'
			})
			.then(r => r.json())
			.then(u => resolve(u));
		});
	});
    }

    /**
     * @typedef IdProvider
     * @property {string} id - ID of provider
     * @property {string} title - Descriptive name
     * @property {string} type - Federated or internal
     * @property {string} credentialHandlingType - always redirect
     * @property {string} signInUri - URI for logging in
     * @property {string} signOutUri - URI for logging out
     */

    /**
     * Obtain details of a SWB identity provider
     *
     * @param {string} name - The name of the identity provider.
     *
     * @returns {Promise<IdProvider>}
     */
    async getIdp(name) {
	if (! this.#authProviders) {
	    await fetch(`${this.api}/api/authentication/public/provider/configs`)
		.then(response => response.json())
		.then(data => {this.#authProviders = data})
	}

	return new Promise(resolve => {
	    resolve(this.#authProviders.find(idp => idp.id === name));
	});
    }

    /**
     * @typedef User
     * @property {string} applyReason
     * @property {string} authenticationProviderId - URL of Cognito pool provider
     * @property {date} createdAt - Date of user creation
     * @property {string} createdBy - User ID who created the user
     * @property {string} email - Email address of user
     * @property {string} encryptedCreds - Should always be "N/A"
     * @property {string} firstName - User's firstname
     * @property {string} identityProviderName - Name of the SWB identity provider
     * @property {bool} isAdmin - Whether the user has administrive rights in SWB
     * @property {bool} isExternalUser - True for non-internal users
     * @property {string} lastName - The user's surname
     * @property {string} ns - Combination of identityProviderName and authenticationProviderId
     * @property {string[]} projectId - list of project IDs the user can access
     * @property {number} rev - User's record revision number
     * @property {string} status - Whether the account is active (enabled) or inactive (disabled)
     * @property {string} uid - The user's ID (u-***********)
     * @property {date} updatedAt - When the user record was last updated
     * @property {string} userRole - User's role within SWB
     * @property {string} username - Should always match email
     * @property {string} usernameInIdp - Should always match email
     */

    /**
     * Create a federated user within SWB
     *
     * @param {string} idp - Object returned from getIdp
     * @param {string} adpUrl - Cognito provider url
     * @param {string} email - User's email address
     * @param {string=} role=researcher - User's role within swb
     *
     * @returns {Promise<User>}
     */
    addFederatedUser(idp, adpUrl, email, role="researcher") {
	const body = {
	    email: email.toLowerCase(),
	    identityProviderName: idp.id,
	    projectId: [],
	    userRole: role,
	    authenticationProviderId: adpUrl,
	    username: email.toLowerCase()
	};

	return new Promise(resolve => {
	    if (this.dryrun) {
		resolve(body);
		return;
	    }

	    fetch(
		`${this.api}/api/users`,
		{
		    'headers': {
			'Content-Type': 'application/json',
			'Authorization': this.#token,
		    },
		    'body': JSON.stringify(body),
		    'method': 'POST'
		})
		.then(r => r.json())
		.then(u => resolve(u));
	});
    }

    /**
     * Fetch a user by their email address and identity provider name.
     *
     * @param {string} email - The user's full email address (case sensitive, because DynamoDB).
     * @param {string} idpName - The short name of the identity provider.
     *
     * @returns {Promise<User>}
     */
    getUserByEmailAndIdp(email, idpName) {
	return new Promise((resolve, reject) => {
	    fetch(
		`${this.api}/api/users`,
		{
		    'headers': {
			'Content-Type': 'application/json',
			'Authorization': this.#token,
		    },
		    'method': 'GET'
		})
		.then(r => r.json())
		.then(users => {
		    if (!users) reject(users);
		    var u = users.find(u => (u.email == email && u.identityProviderName == idpName));
		    if (u) resolve(u);
		    else reject(`${email} not found for ${idpName}`);
		});
	});
    }

    /**
     * Update user details, such as name, status and role
     *
     * @param {string} uid - The user's id
     * @param {string} firstname - User's new firstname
     * @param {string} surname - User's new surname
     * @param {string} status - Either "active" or "inactive"
     * @param {string} userRole - Either "researcher" or "admin"
     *
     * @returns {Promise<User>}
     */
    updateUserDetails(uid, firstname, surname, status, userRole) {
	return new Promise((resolve, reject) => {
	    // It's annoying that SWB doesn't let you fetch a
	    // single user.
	    fetch(
		`${this.api}/api/users`,
		{
		    'headers': {
			'Content-Type': 'application/json',
			'Authorization': this.#token,
		    },
		    'method': 'GET'
		})
		.then(r => r.json())
		.then(users => {
		    var u = users.find(u => u.uid === uid);
		    if (typeof u === 'undefined') {
			reject('uid not found while adding project');
			return;
		    }

		    var u2 = {
			applyReason: u.applyReason,
			email: u.email,
			firstName: firstname,
			isAdmin: u.isAdmin,
			isExternalUser: u.isExternalUser,
			lastName: surname,
			projectId: u.projectId,
			rev: u.rev,
			status: status,
			userRole: userRole,
		    };

		    if (this.dryrun) {
			resolve(u2);
			return;
		    }

		    fetch(`${this.api}/api/users/${uid}`,
			  {
			      'headers': {
				  'Content-Type': 'application/json',
				  'Authorization': this.#token,
			      },
			      'method': 'PUT',
			      'body': JSON.stringify(u2)
			  }).then(u => {
			      resolve(u);
			  });
		});
	});
    }

    /**
     * Update user details, such as name, status and role
     *
     * @param {string} projectId - The ID of the project
     * @param {string} uid - The user's id
     * @param {string} action - Either "add" or "remove"
     *
     * @returns {Promise<User>}
     */
    addRemoveProjectUser(projectId, uid, action='add') {
	return new Promise((resolve,reject) => {
	    // It's annoying that SWB doesn't let you fetch a
	    // single user.
	    fetch(
		`${this.api}/api/users`,
		{
		    'headers': {
			'Content-Type': 'application/json',
			'Authorization': this.#token,
		    },
		    'method': 'GET'
		})
		.then(r => r.json())
		.then(users => {
		    var u = users.find(u => u.uid === uid);
		    if (typeof u === 'undefined') {
			reject(`uid ${uid} not found while ${action} to/from ${projectId}`);
			return;
		    }

		    // make a new object excluding non-updatable properties
		    var u2 = {
			applyReason: u.applyReason,
			email: u.email,
			firstName: u.firstName,
			isAdmin: u.isAdmin,
			isExternalUser: u.isExternalUser,
			lastName: u.lastName,
			projectId: u.projectId,
			rev: u.rev,
			status: u.status,
			userRole: u.userRole,
		    };

		    // console.log(`${action} ${uid} to ${projectId}`);

		    // remove the project to prevent duplicates
		    u2.projectId = u2.projectId.filter(id => id !== projectId);
		    if (action === 'add') // add it again if needed
			u2.projectId.push(projectId);

		    if (u.projectId.sort().join() === u2.projectId.sort().join()) {
			resolve(u);
			return;
		    }

		    if (this.dryrun) {
			resolve(u2);
			return;
		    }

		    fetch(
			`${this.api}/api/users/${uid}`,
			{
			    'headers': {
				'Content-Type': 'application/json',
				'Authorization': this.#token,
			    },
			    'method': 'PUT',
			    'body': JSON.stringify(u2),
			})
			.then(r => r.json())
			.then(u => resolve(u));
		});
	});
    };

    /**
     * @typedef Project
     * @property {date} createdAt - Date of project creation
     * @property {string} createdBy - User ID who created the project
     * @property {string} description - Human-readable description of the project
     * @property {string} id - The project ID
     * @property {string} indexId - The index which the project belongs to
     * @property {string[]} projectAdmins - List of project admin user IDs
     * @property {string} projectSecurityGroup - AWS security group for project
     * @property {number} rev - Revision number of the project record
     * @property {date} updatedAt - The date of last record update
     * @property {string} updatedBy - User ID of who last updated the project
     */

    /**
     * Find a new project by its project ID
     *
     * @param {string} projectId The project's SWB ID
     *
     * @returns {Promise<Project>} A SWB project
     */
    getProject(projectId) {
	return new Promise(resolve => {
	    fetch(`${this.api}/api/projects/${projectId}`,
		{
		    headers: {
			'Content-Type': 'application/json',
			'Authorization': this.#token,
		    },
		    method: "GET"
		})
		.then(r => r.json())
		.then(p => resolve(p));

	});
    }

    /**
     * Update project
     *
     * @param {Project} the project object (as returned by getProject (with changes)
     *
     * @returns {Promise<Project>} The update project
     */
    updateProject(proj) {
	// keep only the fields we can update or need
	const newProj = {
	    description: proj.description,
	    id: proj.id,
	    indexId: proj.indexId,
	    projectAdmins: proj.projectAdmins,
	    rev: proj.rev
	};

	return new Promise(resolve => {
	    if (this.dryrun) {
		resolve(newProj);
		return;
	    }

	    fetch(`${this.api}/api/projects/${proj.id}`,
		  {
		      headers: {
			  'Content-Type': 'application/json',
			  'Authorization': this.#token
		      },
		      method: "PUT",
		      body: JSON.stringify(newProj)
		  })
		.then(r => r.json())
		.then(p => resolve(p));
	});
    }

    /**
     * List all projects
     *
     * @returns {Promise<Project[]>} A list of projects
     */
    getProjects() {
	return new Promise(resolve => {
	    fetch(`${this.api}/api/projects`,
		{
		    headers: {
			'Content-Type': 'application/json',
			'Authorization': this.#token,
		    },
		    method: "GET"
		})
		.then(r => r.json())
		.then(p => resolve(p));
	});
    }

    /**
     * Create a new project within service workbench.
     *
     * @param {string} projectId - Alphanumeric project id, no spaces
     * @param {string} description - Human-readable project name
     * @param {Index} index - Index which the project belongs in
     * @param {User[]} admins - Users who can administer this project
     *
     * @returns {Promise<Project>} Project which has been created
     */
    createProject(projectId, description, index, admins) {
	const body = {
	    id: projectId,
	    description: description,
	    indexId: index.id,
	    projectAdmins: admins.map(({uid}) => uid),
	};

	return new Promise(resolve => {
	    if (this.dryrun) {
		resolve(body);
		return;
	    }

	    fetch(
		`${this.api}/api/projects`,
		{
		    headers: {
			'Content-Type': 'application/json',
			'Authorization': this.#token,
		    },
		    body: JSON.stringify(body),
		    method: "POST"
		})
		.then(r => r.json())
		.then(p => resolve(p));
	});
    }

    /**
     * @typedef StudyResource
     * @property {string} arn - Amazon Resource Locator for the resource
     */

    /**
     * @typedef StudyPermission
     * @property {date} createdAt - Date of study creation
     * @property {string} createdBy - User ID who created the study permissions
     * @property {date} updatedAt - The date of last record update
     * @property {string} id - The study ID
     * @property {string[]} adminUsers - List of admin user IDs
     * @property {string[]} readonlyUsers - List of read-only user IDs
     */

    /**
     * @typedef Study
     * @property {date} createdAt - Date of study creation
     * @property {string} createdBy - User ID who created the study
     * @property {date} updatedAt - The date of last record update
     * @property {string} updatedBy - User ID of who last updated the study
     * @property {string} description - Human-readable description of the study
     * @property {string} id - The project ID
     * @property {string} name - The project name
     * @property {string[]} projectId - Array of projects which the study belongs to (should only contain 1)
     * @property {string} studyType - Whether it's structured or unstructured
     * @property {string[]} projectAdmins - List of project admin user IDs
     * @property {string} projectSecurityGroup - AWS security group for project
     * @property {number} rev - Revision number of the project record
     * @property {bool} uploadLocationEnabled - Whether uploading from SWB is enabled
     * @property {string} access - Currently user has readonly or admin access to study
     * @property {StudyResource[]} resources - Array of study resources
     */

    /**
     * List all studies
     *
     * @param {string=} category - Either "My Studies" or "Organization" (default)
     *
     * @returns {Promise<Study[]>} A list of projects
     */
    getStudies(category="Organization") {
	if (!["Organization", "My Studies"].includes(category))
	    throw("Invalid category type.");
	category = encodeURI(category);

	return new Promise(resolve => {
	    fetch(`${this.api}/api/studies/?category=${category}`,
		{
		    headers: {
			'Content-Type': 'application/json',
			'Authorization': this.#token,
		    },
		    method: "GET"
		})
		.then(r => r.json())
		.then(p => resolve(p));
	});
    }

    /**
     * Get a specific study given an id.
     *
     * @param {string} studyId - the study's ID in SWB
     *
     * @returns {Promise<Study>} A list of projects
     */
    getStudy(studyId) {
	return new Promise(resolve => {
	    fetch(`${this.api}/api/studies/${studyId}`,
		{
		    headers: {
			'Content-Type': 'application/json',
			'Authorization': this.#token,
		    },
		    method: "GET"
		})
		.then(r => r.json())
		.then(p => resolve(p));
	});
    }

    /**
     * Create a study
     *
     * @param {string} id - An id for the study (e.g. project-1234-study)
     * @param {string} name - The human-readable study's name
     * @param {string} description - Study's description
     * @param {string} projectId - The project the study belongs to
     * @param {string=} category - "Organization" (default) or "My Studies"
     * @param {string=} studyType - Must be "unstructured" (default) or "structured".
     * @param {bool=} uploadLocationEnabled - Whether upload from SWB is enabled (default true)
     *
     * @returns {Promise<Study>}
     */
    createStudy(id, name, description, projectId,
		 category="Organization", studyType="unstructured",
		 uploadLocationEnabled=true) {
	if (!["Organization", "My Studies"].includes(category))
	    throw("Invalid category type.");

	if (!["unstructured", "structured"].includes(studyType))
	    throw("Invalid study type");

	const body = {
	    id: id,
	    studyType: studyType,
	    name: name,
	    description: description,
	    projectId: [ projectId ],
	    category: category,
	    uploadLocationEnabled: uploadLocationEnabled
	};
	console.log(body);

	return new Promise(resolve => {
	    if (this.dryrun) {
		resolve(body);
		return;
	    }

	    fetch(
		`${this.api}/api/studies`,
		{
		    headers: {
			'Content-Type': 'application/json',
			'Authorization': this.#token,
		    },
		    body: JSON.stringify(body),
		    method: "POST"
		})
		.then(r => r.json())
		.then(p => resolve(p));
	});
    }

   /**
     * Get a study permissions for a given study
     *
     * @param {string} studyId - the study's ID in SWB
     *
     * @returns {Promise<StudyPermission>}
     */
    getStudyPermissions(studyId) {
	return new Promise(resolve => {
	    fetch(`${this.api}/api/studies/${studyId}/permissions`,
		{
		    headers: {
			'Content-Type': 'application/json',
			'Authorization': this.#token,
		    },
		    method: "GET"
		})
		.then(r => r.json())
		.then(p => resolve(p));
	});
    }


    /**
     * Add or remove a user from a study
     *
     * @param {string} studyId - The study's id
     * @param {string} userId - The user's id
     * @param {string} action - Should be "add" or "remove"
     * @param {string=} permissionLevel - Should be "readonly" (default) or "admin"
     *
     * @returns {Promise<StudyPermission>}
     */
    addRemoveStudyPermission(studyId, userId, action, permissionLevel="readonly") {
	if (!["readonly", "admin"].includes(permissionLevel))
	    throw("Invalid permission level");

	if (!["add", "remove"].includes(action))
	    throw("Invalid action");

	var body = {
	    usersToAdd: [],
	    usersToRemove: [],
	};

	if (action == "add")
	    body.usersToAdd.push({
		uid: userId,
		permissionLevel: permissionLevel
	    });
	else
	    body.usersToRemove.push({
		uid: userId,
		permissionLevel: permissionLevel
	    });

	return new Promise((resolve,reject) => {
	    if (this.dryrun) {
		resolve(body);
		return;
	    }

	    fetch(`${this.api}/api/studies/${studyId}/permissions`,
		  {
		      headers: {
			  'Content-Type': 'application/json',
			  'Authorization': this.#token,
		      },
		      method: "PUT",
		      body: JSON.stringify(body)
		  })
		.then(r => r.json())
		.then(p => {
		    if (p.hasOwnProperty('code')) {
			reject(p.message);
			return;
		    }
		    resolve(p)
		});
	});
    }

    /**
     * @typedef StudyPermission
     * @property {date} createdAt - Date of study creation
     * @property (string) createdBy - The user who imported the workspace type
     * @property {string} desc - Workspace type description
     * @property {string} id - The unique ID of the workspace (product ID + version ID)
     * @property {Object} params - The parameters available for the workspace config - ignoring for now
     * @property {ServiceCatalogProduct} product - Just an object containing productId
     * @property {ServiceCatalogProductVersion} provisioningArtifact - The version id
     * @property {int} rev
     * @property {string} status - enum of "not-approved" or "approved"
     * @property {date} updatedAt
     * @property {string} updatedBy
     */

    /**
     * List all workspace types
     *
     * @returns {Promise<WorkspaceType[]>} A list of projects
     */
    getWorkspaceTypes() {
	return new Promise(resolve => {
	    fetch(`${this.api}/api/workspace-types?status=*`,
		{
		    headers: {
			'Content-Type': 'application/json',
			'Authorization': this.#token,
		    },
		    method: "GET"
		})
		.then(r => r.json())
		.then(p => resolve(p));
	});
    }

    /**
     * Produces an array of workspace configurations for a given type.
     *
     * @property {string} workspaceType - The workspace type ID
     *
     * @returns {Promise<WorkspaceConfiguration[]>}
     */
    getWorkspaceConfigurations(workspaceType) {
	return new Promise(resolve => {
	    fetch(`${this.api}/api/workspace-types/${workspaceType}/configurations/?include=all`,
		  {
		      headers: {
			  'Content-Type': 'application/json',
			  'Authorization': this.#token,
		      },
		      method: "GET"
		  })
		.then(r => r.json())
		.then(p => resolve(p));
	});
    }


    /**
     * Updates a given workspace configuration
     *
     * @property {string} workspaceType - type workspace type ID
     * @property {WorkspaceConfiguration} workspaceConfObj - the updated workspace configuration
     *
     * @returns {Promise<WorkspaceConfiguration>}
     */
    updateWorkspaceConfiguration(workspaceType, workspaceConfObj) {
	delete workspaceConfObj['createdBy'];
	delete workspaceConfObj['updatedBy'];
	delete workspaceConfObj['createdAt'];
	delete workspaceConfObj['updatedAt'];
	delete workspaceConfObj['allowedToUse'];

	return new Promise(resolve => {
	    fetch(`${this.api}/api/workspace-types/${workspaceType}/configurations/${workspaceConfObj.id}`,
		  {
		      headers: {
			  'Content-Type': 'application/json',
			  'Authorization': this.#token,
		      },
		      method: "PUT",
		      body: JSON.stringify(workspaceConfObj),
		  })
		.then(r => r.json())
		.then(p => resolve(p));
	});
    }
}

export default SWB;
