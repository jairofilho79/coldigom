// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Coldigom';

  @override
  String get appSubtitle => 'Praise Management';

  @override
  String get buttonBack => 'Back';

  @override
  String get buttonEdit => 'Edit';

  @override
  String get buttonDelete => 'Delete';

  @override
  String get buttonSave => 'Save';

  @override
  String get buttonCancel => 'Cancel';

  @override
  String get buttonCreate => 'Create';

  @override
  String get buttonUpdate => 'Update';

  @override
  String get buttonConfirm => 'Confirm';

  @override
  String get buttonClose => 'Close';

  @override
  String get buttonLogout => 'Logout';

  @override
  String get buttonRemoveFilter => 'Remove Filter';

  @override
  String get buttonDownload => 'Download';

  @override
  String get buttonDownloading => 'Downloading...';

  @override
  String get buttonDownloadZip => 'Download ZIP';

  @override
  String get buttonEnter => 'Sign In';

  @override
  String get buttonRegister => 'Register';

  @override
  String get buttonTryAgain => 'Try Again';

  @override
  String get labelTags => 'Tags';

  @override
  String get labelMaterials => 'Materials';

  @override
  String get labelName => 'Name';

  @override
  String get labelEmail => 'Email';

  @override
  String get labelPassword => 'Password';

  @override
  String get labelConfirmPassword => 'Confirm Password';

  @override
  String get labelUsername => 'Username';

  @override
  String get labelType => 'Type';

  @override
  String get labelMaterialKind => 'Material Kind';

  @override
  String get labelMaterialType => 'Material Type';

  @override
  String get labelPath => 'Path';

  @override
  String get labelSearch => 'Search';

  @override
  String get labelPraiseName => 'Praise Name';

  @override
  String get labelNumber => 'Number';

  @override
  String get labelNumberOptional => 'Number (optional)';

  @override
  String get labelFileType => 'File Type';

  @override
  String get labelCode => 'Code';

  @override
  String get labelLanguage => 'Language';

  @override
  String get labelOriginal => 'Original';

  @override
  String get labelTranslatedName => 'Translated Name';

  @override
  String get labelEntityType => 'Entity Type';

  @override
  String get labelFilters => 'Filters';

  @override
  String get labelAllLanguages => 'All languages';

  @override
  String get labelPraiseTag => 'Praise Tag';

  @override
  String get labelText => 'Text';

  @override
  String get labelUrl => 'URL';

  @override
  String get labelActive => 'Active';

  @override
  String get labelMaterialKindRequired => 'Material Kind *';

  @override
  String get labelMaterialTypeRequired => 'Material Type *';

  @override
  String get labelSelectMaterialKind => 'Select Material Kind';

  @override
  String get labelSelectFile => 'Select File';

  @override
  String get labelSelectNewFile => 'Select New File';

  @override
  String get labelCurrentFile => 'Current File';

  @override
  String get labelMaxZipSize => 'Maximum ZIP size (MB)';

  @override
  String get labelMaterialIsOld => 'Old Material';

  @override
  String get labelMaterialOldDescription => 'Old Material Description';

  @override
  String get labelSelectTag => 'Select a tag (optional)';

  @override
  String get labelSelectMaterialKindForDownload => 'Select a Material Kind';

  @override
  String get labelDescription => 'Description';

  @override
  String get labelPublic => 'Public';

  @override
  String get labelPrivate => 'Private';

  @override
  String get labelOwner => 'Owner';

  @override
  String get labelDateFrom => 'Date From';

  @override
  String get labelDateTo => 'Date To';

  @override
  String get hintEnterUsername => 'Enter your username';

  @override
  String get hintEnterPassword => 'Enter your password';

  @override
  String get hintEnterEmail => 'Enter your email';

  @override
  String get hintConfirmPassword => 'Confirm your password';

  @override
  String get hintEnterPraiseName => 'Enter praise name';

  @override
  String get hintEnterPraiseNumber => 'Enter praise number (optional)';

  @override
  String get hintEnterTagName => 'Enter tag name';

  @override
  String get hintEnterMaterialKindName => 'Enter material kind name';

  @override
  String get hintEnterMaterialTypeName => 'Enter material type name';

  @override
  String get hintEnterLanguageCode => 'Ex: pt-BR, en-US';

  @override
  String get hintEnterLanguageName => 'Enter language name';

  @override
  String get hintEnterTranslatedName => 'Enter translated name';

  @override
  String get hintEnterSearchPraise => 'Enter praise name...';

  @override
  String get hintEnterListName => 'Enter list name';

  @override
  String get hintEnterListDescription => 'Enter list description (optional)';

  @override
  String hintEnterUrl(String platform) {
    return 'Paste $platform URL';
  }

  @override
  String get hintEnterText => 'Enter material text';

  @override
  String get hintEnterOldDescription =>
      'Describe why this material is old (optional)';

  @override
  String get hintEnterReviewDescription => 'Describe the reason for review...';

  @override
  String get hintSelectFile => 'Select a PDF or audio file';

  @override
  String get hintSelectNewFileToReplace => 'Select a new file to replace';

  @override
  String get validationRequired => 'This field is required';

  @override
  String get validationTranslatedNameRequired => 'Translated name is required';

  @override
  String validationMinLength(int min) {
    return 'Minimum of $min characters';
  }

  @override
  String validationMaxLength(int max) {
    return 'Maximum of $max characters';
  }

  @override
  String get validationEnterUsername => 'Please enter your username';

  @override
  String get validationEnterPassword => 'Please enter your password';

  @override
  String get validationEnterEmail => 'Please enter your email';

  @override
  String get validationValidEmail => 'Please enter a valid email';

  @override
  String get validationUsernameMinLength =>
      'Username must be at least 3 characters';

  @override
  String get validationPasswordMinLength =>
      'Password must be at least 6 characters';

  @override
  String get validationConfirmPassword => 'Please confirm your password';

  @override
  String get validationPasswordMismatch => 'Passwords do not match';

  @override
  String get validationUrlRequired => 'URL is required';

  @override
  String get validationUrlInvalid => 'Invalid URL';

  @override
  String get validationTextRequired => 'Text is required';

  @override
  String get validationMaterialKindRequired => 'Material Kind is required';

  @override
  String get validationSelectMaterialType => 'Select material type';

  @override
  String get validationSelectMaterialKind => 'Select Material Kind';

  @override
  String get validationListNameRequired => 'List name is required';

  @override
  String get pageTitleDashboard => 'Dashboard';

  @override
  String get pageTitlePraises => 'Praises';

  @override
  String get pageTitleTags => 'Tags';

  @override
  String get pageTitleMaterialKinds => 'Material Kinds';

  @override
  String get pageTitleMaterialTypes => 'Material Types';

  @override
  String get pageTitleLanguages => 'Languages';

  @override
  String get pageTitleCreatePraise => 'Create Praise';

  @override
  String get pageTitleEditPraise => 'Edit Praise';

  @override
  String get pageTitlePraiseDetails => 'Praise Details';

  @override
  String get pageTitleRegister => 'Register';

  @override
  String get pageTitleCreateTag => 'Create Tag';

  @override
  String get pageTitleEditTag => 'Edit Tag';

  @override
  String get pageTitleCreateMaterialKind => 'Create Material Kind';

  @override
  String get pageTitleEditMaterialKind => 'Edit Material Kind';

  @override
  String get pageTitleCreateMaterialType => 'Create Material Type';

  @override
  String get pageTitleEditMaterialType => 'Edit Material Type';

  @override
  String get pageTitleCreateLanguage => 'Create Language';

  @override
  String get pageTitleEditLanguage => 'Edit Language';

  @override
  String get pageTitleTranslations => 'Translations';

  @override
  String get pageTitleCreateTranslation => 'Create Translation';

  @override
  String get pageTitleEditTranslation => 'Edit Translation';

  @override
  String get pageTitlePraiseLists => 'Praise Lists';

  @override
  String get pageTitlePraiseListDetail => 'List Details';

  @override
  String get pageTitlePraiseListCreate => 'Create List';

  @override
  String get pageTitlePraiseListEdit => 'Edit List';

  @override
  String messageWelcome(String username) {
    return 'Welcome, $username!';
  }

  @override
  String get messageNotAuthenticated => 'Not authenticated';

  @override
  String get messageNoTagsAvailable => 'No tags available';

  @override
  String get messageNoMaterialsAdded => 'No materials added';

  @override
  String get messageNoMaterialKindsAvailable => 'No Material Kinds available';

  @override
  String get messageNoTagsForFilter => 'No tag (all praises)';

  @override
  String get messageNoMaterials => 'No materials registered';

  @override
  String get messageNoTranslationsAvailable => 'No translations available';

  @override
  String get messageNoLists => 'No lists found';

  @override
  String get messageNoListsFound => 'No lists found with applied filters';

  @override
  String get messageNoPraisesInList => 'No praises in this list';

  @override
  String get messageUnknown => 'Unknown';

  @override
  String get messageCreatePraiseFirst => 'You need to create the praise first';

  @override
  String get messageFileSelected =>
      'New file selected. Current file will be replaced.';

  @override
  String messageNewFile(String fileName) {
    return 'New File: $fileName';
  }

  @override
  String messageVersion(String version, String buildNumber) {
    return 'Version: $version ($buildNumber)';
  }

  @override
  String messageBuild(String date) {
    return 'Build: $date';
  }

  @override
  String get messageNoAccount => 'Don\'t have an account? Register';

  @override
  String get messageHasAccount => 'Already have an account? Sign in';

  @override
  String get messageLanguageAvailable => 'Language available for use';

  @override
  String get messageMaterialOld => 'Mark if this material is outdated';

  @override
  String messageZipSaved(String path) {
    return 'ZIP saved at: $path';
  }

  @override
  String messagePageOf(int current, int total) {
    return 'Page $current of $total';
  }

  @override
  String messageId(String id) {
    return 'ID: $id';
  }

  @override
  String messageCode(String code) {
    return 'Code: $code';
  }

  @override
  String messageMaxZipSize(int size) {
    return '$size MB';
  }

  @override
  String get sectionTags => 'Tags';

  @override
  String get sectionMaterials => 'Materials';

  @override
  String get sectionReviewHistory => 'Review History';

  @override
  String get statusInReview => 'In Review';

  @override
  String get statusLoading => 'Loading...';

  @override
  String get statusDownloadingZip => 'Downloading ZIP...';

  @override
  String get badgeInReview => 'In Review';

  @override
  String get badgeOld => 'Old';

  @override
  String badgeNumber(int number) {
    return '#$number';
  }

  @override
  String get actionAddMaterial => 'Add Material';

  @override
  String get actionEdit => 'Edit';

  @override
  String get actionDelete => 'Delete';

  @override
  String get actionDownload => 'Download';

  @override
  String get actionPlay => 'Play';

  @override
  String get actionView => 'View';

  @override
  String get actionStartReview => 'Start Review';

  @override
  String get actionCancelReview => 'Cancel Review';

  @override
  String get actionFinishReview => 'Finish Review';

  @override
  String get actionFilter => 'Filter';

  @override
  String get actionAll => 'All';

  @override
  String get actionViewOldMaterials => 'View Old';

  @override
  String get actionHideOldMaterials => 'Hide Old';

  @override
  String get actionAddTranslation => 'Add Translation';

  @override
  String get actionNewList => 'New List';

  @override
  String get actionCreateFirstList => 'Create first list';

  @override
  String get actionFollow => 'Follow';

  @override
  String get actionUnfollow => 'Unfollow';

  @override
  String get actionCopy => 'Copy';

  @override
  String get actionCopyList => 'Copy List';

  @override
  String get actionAddToList => 'Add to List';

  @override
  String get actionRemoveFromList => 'Remove from List';

  @override
  String get actionMoveUp => 'Move Up';

  @override
  String get actionMoveDown => 'Move Down';

  @override
  String get actionClearFilters => 'Clear Filters';

  @override
  String get dialogTitleConfirmDelete => 'Confirm Deletion';

  @override
  String get dialogTitleStartReview => 'Start Review';

  @override
  String get dialogTitleDownloadZip => 'Download Praise as ZIP';

  @override
  String get dialogMessageDeletePraise =>
      'Are you sure you want to delete this praise? This action cannot be undone.';

  @override
  String get dialogMessageDeleteTag =>
      'Are you sure you want to delete this tag?';

  @override
  String get dialogMessageDeleteMaterialKind =>
      'Are you sure you want to delete this material kind?';

  @override
  String get dialogMessageDeleteMaterialType =>
      'Are you sure you want to delete this material type?';

  @override
  String get dialogMessageDeleteLanguage =>
      'Are you sure you want to delete this language?';

  @override
  String get dialogMessageDeleteTranslation =>
      'Are you sure you want to delete this translation?';

  @override
  String get dialogMessageDeleteMaterial =>
      'Are you sure you want to delete this material?';

  @override
  String get dialogMessageDeletePraiseList =>
      'Are you sure you want to delete this list? This action cannot be undone.';

  @override
  String get dialogMessageRemovePraiseFromList =>
      'Are you sure you want to remove this praise from the list?';

  @override
  String get dialogMessageNoFileMaterials =>
      'This praise has no file materials for download';

  @override
  String get dialogLabelReviewDescription => 'Description (optional)';

  @override
  String get errorConnectionFailed =>
      'Could not connect to server.\nMake sure the backend is running at http://127.0.0.1:8000';

  @override
  String get errorInvalidCredentials => 'Incorrect username or password';

  @override
  String errorLogin(String error) {
    return 'Error logging in: $error';
  }

  @override
  String errorRegister(String error) {
    return 'Error registering: $error';
  }

  @override
  String errorSelectFile(String error) {
    return 'Error selecting file: $error';
  }

  @override
  String errorSaveMaterial(String error) {
    return 'Error saving material: $error';
  }

  @override
  String errorDeleteMaterial(String error) {
    return 'Error deleting material: $error';
  }

  @override
  String errorLoadMaterials(String error) {
    return 'Error loading materials: $error';
  }

  @override
  String errorDownloadZip(String error) {
    return 'Error downloading ZIP: $error';
  }

  @override
  String errorLoadPraise(String error) {
    return 'Error loading praise: $error';
  }

  @override
  String errorLoadMaterialKind(String error) {
    return 'Error loading material kind: $error';
  }

  @override
  String errorLoadMaterialType(String error) {
    return 'Error loading material type: $error';
  }

  @override
  String errorLoadAudio(String error) {
    return 'Error loading audio: $error';
  }

  @override
  String get errorLoadPdf => 'Error loading PDF';

  @override
  String errorCreatePraise(String error) {
    return 'Error creating praise: $error';
  }

  @override
  String errorUpdatePraise(String error) {
    return 'Error updating praise: $error';
  }

  @override
  String errorDeletePraise(String error) {
    return 'Error deleting: $error';
  }

  @override
  String errorStartReview(String error) {
    return 'Error starting review: $error';
  }

  @override
  String errorCancelReview(String error) {
    return 'Error canceling review: $error';
  }

  @override
  String errorFinishReview(String error) {
    return 'Error finishing review: $error';
  }

  @override
  String errorSaveTag(String error) {
    return 'Error saving tag: $error';
  }

  @override
  String errorDeleteTag(String error) {
    return 'Error deleting tag: $error';
  }

  @override
  String errorSaveMaterialKind(String error) {
    return 'Error saving material kind: $error';
  }

  @override
  String errorDeleteMaterialKind(String error) {
    return 'Error deleting material kind: $error';
  }

  @override
  String errorSaveMaterialType(String error) {
    return 'Error saving material type: $error';
  }

  @override
  String errorDeleteMaterialType(String error) {
    return 'Error deleting material type: $error';
  }

  @override
  String errorSaveLanguage(String error) {
    return 'Error saving language: $error';
  }

  @override
  String errorDeleteLanguage(String error) {
    return 'Error deleting language: $error';
  }

  @override
  String errorDeleteTranslation(String error) {
    return 'Error deleting translation: $error';
  }

  @override
  String errorSaveTranslation(String error) {
    return 'Error saving translation: $error';
  }

  @override
  String errorLoadTranslation(String error) {
    return 'Error loading translation: $error';
  }

  @override
  String errorLoadPraiseList(Object error) {
    return 'Error loading list: $error';
  }

  @override
  String errorCreatePraiseList(Object error) {
    return 'Error creating list: $error';
  }

  @override
  String errorUpdatePraiseList(Object error) {
    return 'Error updating list: $error';
  }

  @override
  String errorDeletePraiseList(Object error) {
    return 'Error deleting list: $error';
  }

  @override
  String errorAddPraiseToList(Object error) {
    return 'Error adding praise to list: $error';
  }

  @override
  String errorRemovePraiseFromList(Object error) {
    return 'Error removing praise from list: $error';
  }

  @override
  String errorFollowList(Object error) {
    return 'Error following list: $error';
  }

  @override
  String errorUnfollowList(Object error) {
    return 'Error unfollowing list: $error';
  }

  @override
  String errorCopyList(Object error) {
    return 'Error copying list: $error';
  }

  @override
  String get errorNeedCreatePraiseFirst => 'Praise must be created first';

  @override
  String get errorDownloadCanceled => 'Download canceled';

  @override
  String get successRegister => 'Registration successful! Please login.';

  @override
  String get successPraiseCreated =>
      'Praise created successfully. You can add materials on the edit page.';

  @override
  String get successPraiseUpdated => 'Praise updated successfully';

  @override
  String get successPraiseDeleted => 'Praise deleted successfully';

  @override
  String get successReviewStarted => 'Review started successfully';

  @override
  String get successReviewCanceled => 'Review canceled successfully';

  @override
  String get successReviewFinished => 'Review finished successfully';

  @override
  String get successMaterialDeleted => 'Material deleted successfully';

  @override
  String get successTagSaved => 'Tag saved successfully';

  @override
  String get successTagDeleted => 'Tag deleted successfully';

  @override
  String get successMaterialKindSaved => 'Material kind saved successfully';

  @override
  String get successMaterialKindDeleted => 'Material kind deleted successfully';

  @override
  String get successMaterialTypeSaved => 'Material type saved successfully';

  @override
  String get successMaterialTypeDeleted => 'Material type deleted successfully';

  @override
  String get successLanguageSaved => 'Language saved successfully';

  @override
  String get successLanguageDeleted => 'Language deleted successfully';

  @override
  String get successTranslationSaved => 'Translation saved successfully';

  @override
  String get successTranslationDeleted => 'Translation deleted successfully';

  @override
  String get successPraiseListCreated => 'List created successfully';

  @override
  String get successPraiseListUpdated => 'List updated successfully';

  @override
  String get successPraiseListDeleted => 'List deleted successfully';

  @override
  String get successPraiseAddedToList => 'Praise added to list successfully';

  @override
  String get successPraiseRemovedFromList =>
      'Praise removed from list successfully';

  @override
  String get successListFollowed => 'List followed successfully';

  @override
  String get successListUnfollowed => 'Unfollowed list successfully';

  @override
  String get successListCopied => 'List copied successfully';

  @override
  String get enumMaterialFormTypeFile => 'File';

  @override
  String get enumMaterialFormTypeYoutube => 'YouTube';

  @override
  String get enumMaterialFormTypeSpotify => 'Spotify';

  @override
  String get enumMaterialFormTypeText => 'Text';

  @override
  String get enumRoomAccessTypePublic => 'Public';

  @override
  String get enumRoomAccessTypePassword => 'With Password';

  @override
  String get enumRoomAccessTypeApproval => 'With Approval';

  @override
  String get enumRoomJoinRequestStatusPending => 'Pending';

  @override
  String get enumRoomJoinRequestStatusApproved => 'Approved';

  @override
  String get enumRoomJoinRequestStatusRejected => 'Rejected';

  @override
  String get reviewActionStart => 'Start';

  @override
  String get reviewActionCancel => 'Cancel';

  @override
  String get reviewActionFinish => 'Finish';

  @override
  String get tooltipDownloadZip => 'Download ZIP';

  @override
  String get tooltipEdit => 'Edit';

  @override
  String get tooltipDelete => 'Delete';

  @override
  String get drawerUser => 'User';

  @override
  String get drawerDashboard => 'Dashboard';

  @override
  String get drawerPraises => 'Praises';

  @override
  String get drawerTags => 'Tags';

  @override
  String get drawerLanguages => 'Languages';

  @override
  String get drawerLanguage => 'Language';

  @override
  String get drawerMaterialKinds => 'Material Kinds';

  @override
  String get drawerMaterialTypes => 'Material Types';

  @override
  String get drawerTranslations => 'Translations';

  @override
  String get drawerPraiseLists => 'Praise Lists';

  @override
  String get drawerLogout => 'Logout';

  @override
  String get languagePortuguese => 'Portuguese';

  @override
  String get languageEnglish => 'English';

  @override
  String languageCurrent(String name) {
    return 'Current language: $name';
  }

  @override
  String get cardPraises => 'Praises';

  @override
  String get cardTags => 'Tags';

  @override
  String get cardMaterialKinds => 'Material Kinds';

  @override
  String get cardLists => 'Lists';

  @override
  String labelPraisesCount(int count) {
    return '$count praise(s)';
  }

  @override
  String get labelBy => 'by';
}
