export default `
<descope-container data-editor-type="container" direction="column" id="ROOT" space-between="md" st-horizontal-padding="1rem" st-vertical-padding="1rem" st-align-items="safe center" st-justify-content="safe center" st-host-width="100%" st-gap="1rem">
    <descope-container data-editor-type="container" direction="row" id="headerContainer" st-horizontal-padding="0rem" st-vertical-padding="0rem" st-align-items="start" st-justify-content="space-between" st-background-color="#ffffff00" st-host-width="100%" st-gap="0rem">
        <descope-text-field bordered="true" full-width="false" id="search" label="" max="100" name="" placeholder="Search" required="false" size="sm" data-testid="search-input" data-id="search-input"></descope-text-field>
        <descope-container data-editor-type="container" direction="row" id="buttonsContainer" st-horizontal-padding="0rem" st-vertical-padding="0rem" st-align-items="start" st-justify-content="flex-end" st-background-color="#ffffff00" st-host-width="auto" st-gap="0.5rem">
            <descope-button data-type="button" formnovalidate="false" full-width="false" id="deleteUsers" shape="" size="sm" variant="outline" data-testid="delete-users-trigger" data-id="delete-users" mode="primary" square="false">Delete</descope-button>
            <descope-button data-type="button" formnovalidate="false" full-width="false" id="removePasskey" shape="" size="sm" variant="outline" data-testid="remove-passkey-trigger" data-id="remove-passkey" mode="primary" square="false">Remove Passkey</descope-button>
            <descope-button data-type="button" formnovalidate="false" full-width="false" id="disableUser" shape="" size="sm" variant="outline" data-testid="disable-user-trigger" data-id="disable-user" mode="primary" square="false">Disable</descope-button>
            <descope-button data-type="button" formnovalidate="false" full-width="false" id="enableUser" shape="" size="sm" variant="outline" data-testid="enable-user-trigger" data-id="enable-user" mode="primary" square="false">Activate</descope-button>
            <descope-button data-type="button" formnovalidate="false" full-width="false" id="editUser" shape="" size="sm" variant="outline" data-testid="edit-user-trigger" data-id="edit-user" mode="primary" square="false">Edit User</descope-button>
            <descope-button data-type="button" formnovalidate="false" full-width="false" id="createUser" shape="" size="sm" variant="contained" data-testid="create-user-trigger" data-id="create-user" mode="primary" square="false">+ User</descope-button>
        </descope-container>
    </descope-container>
    <descope-grid data-id="users-table" size="sm" column-reordering-allowed="true" st-host-height="300px" style="width:100%">
        <descope-grid-selection-column frozen="true" auto-width="true"></descope-grid-selection-column>
        <descope-grid-text-column path="loginIds" header="Login ID" resizable="true"></descope-grid-text-column>
        <descope-grid-custom-column sortable="true" path="status" header="Status" resizable="true">
            <descope-badge mode="default" bordered="true" size="xs" data-pattern="invited" st-text-transform="capitalize"></descope-badge>
            <descope-badge mode="primary" bordered="true" size="xs" data-pattern="active" st-text-transform="capitalize"></descope-badge>
            <descope-badge mode="error" bordered="true" size="xs" data-pattern="disabled" st-text-transform="capitalize"></descope-badge>
        </descope-grid-custom-column>
        <descope-grid-text-column sortable="true" path="name" header="Name" resizable="true"></descope-grid-text-column>
        <descope-grid-text-column sortable="true" path="email" header="Email" resizable="true"></descope-grid-text-column>
        <descope-grid-text-column sortable="true" path="phone" header="Phone" resizable="true"></descope-grid-text-column>
        <descope-grid-text-column path="roles" header="Roles" resizable="true"></descope-grid-text-column>
    </descope-grid>
</descope-container>
`;
