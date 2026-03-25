/**
 * MediaTestModule — English Translations
 *
 * LOCALIZATION_STANDARDS.md: EN is the source of truth.
 * All keys here MUST exist in pl.ts (enforced by quanti validate).
 */

export const translations = {
    // Module title
    title:           'Media Library',
    // Generic states
    loadingText:     'Loading...',
    emptyState:      'No media files found.',
    errorText:       'An error occurred.',
    actionBtn:       'Upload',
    // Gallery / Table view
    uploadBtn:       'Upload image',
    uploadingText:   'Uploading...',
    uploadSuccess:   'File uploaded successfully.',
    uploadError:     'Upload failed. Please try again.',
    deleteBtn:       'Delete',
    deleteConfirm:   'Are you sure you want to delete this file?',
    // Detail panel
    detailTitle:     'File details',
    fieldFilename:   'Filename',
    fieldSize:       'Size',
    fieldType:       'Type',
    fieldAlt:        'Alt text',
    fieldCreatedAt:  'Uploaded on',
    fieldStatus:     'Status',
    altPlaceholder:  'Describe the image for accessibility…',
    saveBtn:         'Save',
    // Dashboard widget
    widgetTitle:     'Media Library',
    widgetTotal:     'Total files',
    widgetRecent:    'Uploaded recently',
    // Project indicator (used in tests)
    projectLabel:    'Project',
};
