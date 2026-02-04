import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_pt.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('pt'),
  ];

  /// No description provided for @appName.
  ///
  /// In pt, this message translates to:
  /// **'Coletânea Digital'**
  String get appName;

  /// com <3 pela IDM (Irmãos da Maranata)
  ///
  /// In pt, this message translates to:
  /// **'com <3 pela ID (Irmãos da Maranata)'**
  String get appSubtitle;

  /// No description provided for @buttonBack.
  ///
  /// In pt, this message translates to:
  /// **'Voltar'**
  String get buttonBack;

  /// No description provided for @buttonEdit.
  ///
  /// In pt, this message translates to:
  /// **'Editar'**
  String get buttonEdit;

  /// No description provided for @buttonDelete.
  ///
  /// In pt, this message translates to:
  /// **'Deletar'**
  String get buttonDelete;

  /// No description provided for @buttonSave.
  ///
  /// In pt, this message translates to:
  /// **'Salvar'**
  String get buttonSave;

  /// No description provided for @buttonCancel.
  ///
  /// In pt, this message translates to:
  /// **'Cancelar'**
  String get buttonCancel;

  /// No description provided for @buttonCreate.
  ///
  /// In pt, this message translates to:
  /// **'Criar'**
  String get buttonCreate;

  /// No description provided for @buttonUpdate.
  ///
  /// In pt, this message translates to:
  /// **'Atualizar'**
  String get buttonUpdate;

  /// No description provided for @buttonConfirm.
  ///
  /// In pt, this message translates to:
  /// **'Confirmar'**
  String get buttonConfirm;

  /// No description provided for @buttonClose.
  ///
  /// In pt, this message translates to:
  /// **'Fechar'**
  String get buttonClose;

  /// No description provided for @buttonLogout.
  ///
  /// In pt, this message translates to:
  /// **'Sair'**
  String get buttonLogout;

  /// No description provided for @buttonRemoveFilter.
  ///
  /// In pt, this message translates to:
  /// **'Remover Filtro'**
  String get buttonRemoveFilter;

  /// No description provided for @buttonDownload.
  ///
  /// In pt, this message translates to:
  /// **'Baixar'**
  String get buttonDownload;

  /// No description provided for @buttonDownloading.
  ///
  /// In pt, this message translates to:
  /// **'Baixando...'**
  String get buttonDownloading;

  /// No description provided for @buttonDownloadByMaterialKind.
  ///
  /// In pt, this message translates to:
  /// **'Baixar por Categoria do Material'**
  String get buttonDownloadByMaterialKind;

  /// No description provided for @buttonDownloadZip.
  ///
  /// In pt, this message translates to:
  /// **'Baixar ZIP'**
  String get buttonDownloadZip;

  /// No description provided for @buttonEnter.
  ///
  /// In pt, this message translates to:
  /// **'Entrar'**
  String get buttonEnter;

  /// No description provided for @buttonRegister.
  ///
  /// In pt, this message translates to:
  /// **'Registrar'**
  String get buttonRegister;

  /// No description provided for @buttonTryAgain.
  ///
  /// In pt, this message translates to:
  /// **'Tentar Novamente'**
  String get buttonTryAgain;

  /// No description provided for @labelTags.
  ///
  /// In pt, this message translates to:
  /// **'Etiquetas'**
  String get labelTags;

  /// No description provided for @labelMaterials.
  ///
  /// In pt, this message translates to:
  /// **'Materiais'**
  String get labelMaterials;

  /// No description provided for @labelName.
  ///
  /// In pt, this message translates to:
  /// **'Nome'**
  String get labelName;

  /// No description provided for @labelEmail.
  ///
  /// In pt, this message translates to:
  /// **'Email'**
  String get labelEmail;

  /// No description provided for @labelPassword.
  ///
  /// In pt, this message translates to:
  /// **'Senha'**
  String get labelPassword;

  /// No description provided for @labelConfirmPassword.
  ///
  /// In pt, this message translates to:
  /// **'Confirmar Senha'**
  String get labelConfirmPassword;

  /// No description provided for @labelUsername.
  ///
  /// In pt, this message translates to:
  /// **'Usuário'**
  String get labelUsername;

  /// No description provided for @labelType.
  ///
  /// In pt, this message translates to:
  /// **'Tipo'**
  String get labelType;

  /// No description provided for @labelMaterialKind.
  ///
  /// In pt, this message translates to:
  /// **'Categoria do Material'**
  String get labelMaterialKind;

  /// No description provided for @labelMaterialType.
  ///
  /// In pt, this message translates to:
  /// **'Tipo do Material'**
  String get labelMaterialType;

  /// No description provided for @labelPath.
  ///
  /// In pt, this message translates to:
  /// **'Caminho'**
  String get labelPath;

  /// No description provided for @labelSearch.
  ///
  /// In pt, this message translates to:
  /// **'Buscar'**
  String get labelSearch;

  /// No description provided for @labelPraiseName.
  ///
  /// In pt, this message translates to:
  /// **'Nome do Louvor'**
  String get labelPraiseName;

  /// No description provided for @labelNumber.
  ///
  /// In pt, this message translates to:
  /// **'Número'**
  String get labelNumber;

  /// No description provided for @labelNumberOptional.
  ///
  /// In pt, this message translates to:
  /// **'Número (opcional)'**
  String get labelNumberOptional;

  /// No description provided for @labelFileType.
  ///
  /// In pt, this message translates to:
  /// **'Tipo de Arquivo'**
  String get labelFileType;

  /// No description provided for @labelCode.
  ///
  /// In pt, this message translates to:
  /// **'Código'**
  String get labelCode;

  /// No description provided for @labelLanguage.
  ///
  /// In pt, this message translates to:
  /// **'Idioma'**
  String get labelLanguage;

  /// No description provided for @labelOriginal.
  ///
  /// In pt, this message translates to:
  /// **'Original'**
  String get labelOriginal;

  /// No description provided for @labelTranslatedName.
  ///
  /// In pt, this message translates to:
  /// **'Nome Traduzido'**
  String get labelTranslatedName;

  /// No description provided for @labelEntityType.
  ///
  /// In pt, this message translates to:
  /// **'Tipo de Entidade'**
  String get labelEntityType;

  /// No description provided for @labelFilters.
  ///
  /// In pt, this message translates to:
  /// **'Filtros'**
  String get labelFilters;

  /// No description provided for @labelAllLanguages.
  ///
  /// In pt, this message translates to:
  /// **'Todos os idiomas'**
  String get labelAllLanguages;

  /// No description provided for @labelPraiseTag.
  ///
  /// In pt, this message translates to:
  /// **'Etiqueta do louvor'**
  String get labelPraiseTag;

  /// No description provided for @labelText.
  ///
  /// In pt, this message translates to:
  /// **'Texto'**
  String get labelText;

  /// No description provided for @labelUrl.
  ///
  /// In pt, this message translates to:
  /// **'URL'**
  String get labelUrl;

  /// No description provided for @labelActive.
  ///
  /// In pt, this message translates to:
  /// **'Ativa'**
  String get labelActive;

  /// No description provided for @labelMaterialKindRequired.
  ///
  /// In pt, this message translates to:
  /// **'Categoria do Material *'**
  String get labelMaterialKindRequired;

  /// No description provided for @labelMaterialTypeRequired.
  ///
  /// In pt, this message translates to:
  /// **'Tipo do Material *'**
  String get labelMaterialTypeRequired;

  /// No description provided for @labelSelectMaterialKind.
  ///
  /// In pt, this message translates to:
  /// **'Selecione a categoria do material'**
  String get labelSelectMaterialKind;

  /// No description provided for @labelSelectFile.
  ///
  /// In pt, this message translates to:
  /// **'Selecionar Arquivo'**
  String get labelSelectFile;

  /// No description provided for @labelSelectNewFile.
  ///
  /// In pt, this message translates to:
  /// **'Selecionar Novo Arquivo'**
  String get labelSelectNewFile;

  /// No description provided for @labelCurrentFile.
  ///
  /// In pt, this message translates to:
  /// **'Arquivo Atual'**
  String get labelCurrentFile;

  /// No description provided for @labelMaxZipSize.
  ///
  /// In pt, this message translates to:
  /// **'Tamanho máximo por ZIP (MB)'**
  String get labelMaxZipSize;

  /// No description provided for @labelMaterialIsOld.
  ///
  /// In pt, this message translates to:
  /// **'Material Antigo'**
  String get labelMaterialIsOld;

  /// No description provided for @labelMaterialOldDescription.
  ///
  /// In pt, this message translates to:
  /// **'Descrição do Material Antigo'**
  String get labelMaterialOldDescription;

  /// No description provided for @labelSelectTag.
  ///
  /// In pt, this message translates to:
  /// **'Selecione uma etiqueta (opcional)'**
  String get labelSelectTag;

  /// No description provided for @labelSelectMaterialKindForDownload.
  ///
  /// In pt, this message translates to:
  /// **'Selecione uma Categoria do Material'**
  String get labelSelectMaterialKindForDownload;

  /// No description provided for @labelDescription.
  ///
  /// In pt, this message translates to:
  /// **'Descrição'**
  String get labelDescription;

  /// No description provided for @labelPublic.
  ///
  /// In pt, this message translates to:
  /// **'Pública'**
  String get labelPublic;

  /// No description provided for @labelPrivate.
  ///
  /// In pt, this message translates to:
  /// **'Privada'**
  String get labelPrivate;

  /// No description provided for @labelOwner.
  ///
  /// In pt, this message translates to:
  /// **'Dono'**
  String get labelOwner;

  /// No description provided for @labelDateFrom.
  ///
  /// In pt, this message translates to:
  /// **'Data Inicial'**
  String get labelDateFrom;

  /// No description provided for @labelDateTo.
  ///
  /// In pt, this message translates to:
  /// **'Data Final'**
  String get labelDateTo;

  /// No description provided for @hintEnterUsername.
  ///
  /// In pt, this message translates to:
  /// **'Digite seu usuário'**
  String get hintEnterUsername;

  /// No description provided for @hintEnterPassword.
  ///
  /// In pt, this message translates to:
  /// **'Digite sua senha'**
  String get hintEnterPassword;

  /// No description provided for @hintEnterEmail.
  ///
  /// In pt, this message translates to:
  /// **'Digite seu email'**
  String get hintEnterEmail;

  /// No description provided for @hintConfirmPassword.
  ///
  /// In pt, this message translates to:
  /// **'Confirme sua senha'**
  String get hintConfirmPassword;

  /// No description provided for @hintEnterPraiseName.
  ///
  /// In pt, this message translates to:
  /// **'Digite o nome do louvor'**
  String get hintEnterPraiseName;

  /// No description provided for @hintEnterPraiseNumber.
  ///
  /// In pt, this message translates to:
  /// **'Digite o número do louvor (opcional)'**
  String get hintEnterPraiseNumber;

  /// No description provided for @hintEnterTagName.
  ///
  /// In pt, this message translates to:
  /// **'Digite o nome da etiqueta'**
  String get hintEnterTagName;

  /// No description provided for @hintEnterMaterialKindName.
  ///
  /// In pt, this message translates to:
  /// **'Digite o nome da Categoria do Material'**
  String get hintEnterMaterialKindName;

  /// No description provided for @hintEnterMaterialTypeName.
  ///
  /// In pt, this message translates to:
  /// **'Digite o nome do Tipo do Material'**
  String get hintEnterMaterialTypeName;

  /// No description provided for @hintEnterLanguageCode.
  ///
  /// In pt, this message translates to:
  /// **'Ex: pt-BR, en-US'**
  String get hintEnterLanguageCode;

  /// No description provided for @hintEnterLanguageName.
  ///
  /// In pt, this message translates to:
  /// **'Digite o nome da linguagem'**
  String get hintEnterLanguageName;

  /// No description provided for @hintEnterTranslatedName.
  ///
  /// In pt, this message translates to:
  /// **'Digite o nome traduzido'**
  String get hintEnterTranslatedName;

  /// No description provided for @hintEnterSearchPraise.
  ///
  /// In pt, this message translates to:
  /// **'Digite o nome do louvor...'**
  String get hintEnterSearchPraise;

  /// No description provided for @hintEnterListName.
  ///
  /// In pt, this message translates to:
  /// **'Digite o nome da lista'**
  String get hintEnterListName;

  /// No description provided for @hintEnterListDescription.
  ///
  /// In pt, this message translates to:
  /// **'Digite a descrição da lista (opcional)'**
  String get hintEnterListDescription;

  /// No description provided for @hintEnterUrl.
  ///
  /// In pt, this message translates to:
  /// **'Cole a URL do {platform}'**
  String hintEnterUrl(String platform);

  /// No description provided for @hintEnterText.
  ///
  /// In pt, this message translates to:
  /// **'Digite o texto do material'**
  String get hintEnterText;

  /// No description provided for @hintEnterOldDescription.
  ///
  /// In pt, this message translates to:
  /// **'Descreva por que este material está antigo (opcional)'**
  String get hintEnterOldDescription;

  /// No description provided for @hintEnterReviewDescription.
  ///
  /// In pt, this message translates to:
  /// **'Descreva o motivo da revisão...'**
  String get hintEnterReviewDescription;

  /// No description provided for @hintSelectFile.
  ///
  /// In pt, this message translates to:
  /// **'Selecione um arquivo PDF ou de áudio'**
  String get hintSelectFile;

  /// No description provided for @hintSelectNewFileToReplace.
  ///
  /// In pt, this message translates to:
  /// **'Selecione um novo arquivo para substituir'**
  String get hintSelectNewFileToReplace;

  /// No description provided for @validationRequired.
  ///
  /// In pt, this message translates to:
  /// **'Este campo é obrigatório'**
  String get validationRequired;

  /// No description provided for @validationTranslatedNameRequired.
  ///
  /// In pt, this message translates to:
  /// **'O nome traduzido é obrigatório'**
  String get validationTranslatedNameRequired;

  /// No description provided for @validationMinLength.
  ///
  /// In pt, this message translates to:
  /// **'Mínimo de {min} caracteres'**
  String validationMinLength(int min);

  /// No description provided for @validationMaxLength.
  ///
  /// In pt, this message translates to:
  /// **'Máximo de {max} caracteres'**
  String validationMaxLength(int max);

  /// No description provided for @validationEnterUsername.
  ///
  /// In pt, this message translates to:
  /// **'Por favor, digite seu usuário'**
  String get validationEnterUsername;

  /// No description provided for @validationEnterPassword.
  ///
  /// In pt, this message translates to:
  /// **'Por favor, digite sua senha'**
  String get validationEnterPassword;

  /// No description provided for @validationEnterEmail.
  ///
  /// In pt, this message translates to:
  /// **'Por favor, digite seu email'**
  String get validationEnterEmail;

  /// No description provided for @validationValidEmail.
  ///
  /// In pt, this message translates to:
  /// **'Por favor, digite um email válido'**
  String get validationValidEmail;

  /// No description provided for @validationUsernameMinLength.
  ///
  /// In pt, this message translates to:
  /// **'Usuário deve ter pelo menos 3 caracteres'**
  String get validationUsernameMinLength;

  /// No description provided for @validationPasswordMinLength.
  ///
  /// In pt, this message translates to:
  /// **'Senha deve ter pelo menos 6 caracteres'**
  String get validationPasswordMinLength;

  /// No description provided for @validationConfirmPassword.
  ///
  /// In pt, this message translates to:
  /// **'Por favor, confirme sua senha'**
  String get validationConfirmPassword;

  /// No description provided for @validationPasswordMismatch.
  ///
  /// In pt, this message translates to:
  /// **'As senhas não coincidem'**
  String get validationPasswordMismatch;

  /// No description provided for @validationUrlRequired.
  ///
  /// In pt, this message translates to:
  /// **'URL é obrigatória'**
  String get validationUrlRequired;

  /// No description provided for @validationUrlInvalid.
  ///
  /// In pt, this message translates to:
  /// **'URL inválida'**
  String get validationUrlInvalid;

  /// No description provided for @validationTextRequired.
  ///
  /// In pt, this message translates to:
  /// **'Texto é obrigatório'**
  String get validationTextRequired;

  /// No description provided for @validationMaterialKindRequired.
  ///
  /// In pt, this message translates to:
  /// **'Categoria do Material é obrigatório'**
  String get validationMaterialKindRequired;

  /// No description provided for @validationSelectMaterialType.
  ///
  /// In pt, this message translates to:
  /// **'Selecione o Tipo do Material'**
  String get validationSelectMaterialType;

  /// No description provided for @validationSelectMaterialKind.
  ///
  /// In pt, this message translates to:
  /// **'Selecione a Categoria do Material'**
  String get validationSelectMaterialKind;

  /// No description provided for @validationListNameRequired.
  ///
  /// In pt, this message translates to:
  /// **'Nome da lista é obrigatório'**
  String get validationListNameRequired;

  /// No description provided for @pageTitleDashboard.
  ///
  /// In pt, this message translates to:
  /// **'Início'**
  String get pageTitleDashboard;

  /// No description provided for @pageTitlePraises.
  ///
  /// In pt, this message translates to:
  /// **'Louvores'**
  String get pageTitlePraises;

  /// No description provided for @pageTitleTags.
  ///
  /// In pt, this message translates to:
  /// **'Etiquetas'**
  String get pageTitleTags;

  /// No description provided for @pageTitleMaterialKinds.
  ///
  /// In pt, this message translates to:
  /// **'Categorias do Material'**
  String get pageTitleMaterialKinds;

  /// No description provided for @pageTitleMaterialTypes.
  ///
  /// In pt, this message translates to:
  /// **'Tipos do Material'**
  String get pageTitleMaterialTypes;

  /// No description provided for @pageTitleLanguages.
  ///
  /// In pt, this message translates to:
  /// **'Linguagens'**
  String get pageTitleLanguages;

  /// No description provided for @pageTitleCreatePraise.
  ///
  /// In pt, this message translates to:
  /// **'Criar Louvor'**
  String get pageTitleCreatePraise;

  /// No description provided for @pageTitleEditPraise.
  ///
  /// In pt, this message translates to:
  /// **'Editar Louvor'**
  String get pageTitleEditPraise;

  /// No description provided for @pageTitlePraiseDetails.
  ///
  /// In pt, this message translates to:
  /// **'Detalhes do Louvor'**
  String get pageTitlePraiseDetails;

  /// No description provided for @pageTitleRegister.
  ///
  /// In pt, this message translates to:
  /// **'Registro'**
  String get pageTitleRegister;

  /// No description provided for @pageTitleCreateTag.
  ///
  /// In pt, this message translates to:
  /// **'Criar Etiqueta'**
  String get pageTitleCreateTag;

  /// No description provided for @pageTitleEditTag.
  ///
  /// In pt, this message translates to:
  /// **'Editar Etiqueta'**
  String get pageTitleEditTag;

  /// No description provided for @pageTitleCreateMaterialKind.
  ///
  /// In pt, this message translates to:
  /// **'Criar Categoria do Material'**
  String get pageTitleCreateMaterialKind;

  /// No description provided for @pageTitleEditMaterialKind.
  ///
  /// In pt, this message translates to:
  /// **'Editar Categoria do Material'**
  String get pageTitleEditMaterialKind;

  /// No description provided for @pageTitleCreateMaterialType.
  ///
  /// In pt, this message translates to:
  /// **'Criar Tipo do Material'**
  String get pageTitleCreateMaterialType;

  /// No description provided for @pageTitleEditMaterialType.
  ///
  /// In pt, this message translates to:
  /// **'Editar Tipo do Material'**
  String get pageTitleEditMaterialType;

  /// No description provided for @pageTitleCreateLanguage.
  ///
  /// In pt, this message translates to:
  /// **'Criar Linguagem'**
  String get pageTitleCreateLanguage;

  /// No description provided for @pageTitleEditLanguage.
  ///
  /// In pt, this message translates to:
  /// **'Editar Linguagem'**
  String get pageTitleEditLanguage;

  /// No description provided for @pageTitleTranslations.
  ///
  /// In pt, this message translates to:
  /// **'Traduções'**
  String get pageTitleTranslations;

  /// No description provided for @pageTitleCreateTranslation.
  ///
  /// In pt, this message translates to:
  /// **'Criar Tradução'**
  String get pageTitleCreateTranslation;

  /// No description provided for @pageTitleEditTranslation.
  ///
  /// In pt, this message translates to:
  /// **'Editar Tradução'**
  String get pageTitleEditTranslation;

  /// No description provided for @pageTitlePraiseLists.
  ///
  /// In pt, this message translates to:
  /// **'Listas de Louvores'**
  String get pageTitlePraiseLists;

  /// No description provided for @pageTitlePraiseListDetail.
  ///
  /// In pt, this message translates to:
  /// **'Detalhes da Lista'**
  String get pageTitlePraiseListDetail;

  /// No description provided for @pageTitlePraiseListCreate.
  ///
  /// In pt, this message translates to:
  /// **'Criar Lista'**
  String get pageTitlePraiseListCreate;

  /// No description provided for @pageTitlePraiseListEdit.
  ///
  /// In pt, this message translates to:
  /// **'Editar Lista'**
  String get pageTitlePraiseListEdit;

  /// No description provided for @messageWelcome.
  ///
  /// In pt, this message translates to:
  /// **'Bem-vindo, {username}!'**
  String messageWelcome(String username);

  /// No description provided for @messageNotAuthenticated.
  ///
  /// In pt, this message translates to:
  /// **'Não autenticado'**
  String get messageNotAuthenticated;

  /// No description provided for @messageNoTagsAvailable.
  ///
  /// In pt, this message translates to:
  /// **'Nenhuma etiqueta disponível'**
  String get messageNoTagsAvailable;

  /// No description provided for @messageNoMaterialsAdded.
  ///
  /// In pt, this message translates to:
  /// **'Nenhum material adicionado'**
  String get messageNoMaterialsAdded;

  /// No description provided for @messageNoMaterialKindsAvailable.
  ///
  /// In pt, this message translates to:
  /// **'Nenhum Categoria do Material disponível'**
  String get messageNoMaterialKindsAvailable;

  /// No description provided for @messageNoTagsForFilter.
  ///
  /// In pt, this message translates to:
  /// **'Nenhuma etiqueta (todos os louvores)'**
  String get messageNoTagsForFilter;

  /// No description provided for @messageNoMaterials.
  ///
  /// In pt, this message translates to:
  /// **'Nenhum material cadastrado'**
  String get messageNoMaterials;

  /// No description provided for @messageNoTranslationsAvailable.
  ///
  /// In pt, this message translates to:
  /// **'Nenhuma tradução disponível'**
  String get messageNoTranslationsAvailable;

  /// No description provided for @messageNoLists.
  ///
  /// In pt, this message translates to:
  /// **'Nenhuma lista encontrada'**
  String get messageNoLists;

  /// No description provided for @messageNoListsFound.
  ///
  /// In pt, this message translates to:
  /// **'Nenhuma lista encontrada com os filtros aplicados'**
  String get messageNoListsFound;

  /// No description provided for @messageNoPraisesInList.
  ///
  /// In pt, this message translates to:
  /// **'Nenhum louvor nesta lista'**
  String get messageNoPraisesInList;

  /// No description provided for @messageUnknown.
  ///
  /// In pt, this message translates to:
  /// **'Desconhecido'**
  String get messageUnknown;

  /// No description provided for @messageCreatePraiseFirst.
  ///
  /// In pt, this message translates to:
  /// **'É necessário criar o louvor primeiro'**
  String get messageCreatePraiseFirst;

  /// No description provided for @messageFileSelected.
  ///
  /// In pt, this message translates to:
  /// **'Novo arquivo selecionado. O arquivo atual será substituído.'**
  String get messageFileSelected;

  /// No description provided for @messageNewFile.
  ///
  /// In pt, this message translates to:
  /// **'Novo Arquivo: {fileName}'**
  String messageNewFile(String fileName);

  /// No description provided for @messageVersion.
  ///
  /// In pt, this message translates to:
  /// **'Versão: {version} ({buildNumber})'**
  String messageVersion(String version, String buildNumber);

  /// No description provided for @messageBuild.
  ///
  /// In pt, this message translates to:
  /// **'Build: {date}'**
  String messageBuild(String date);

  /// No description provided for @messageNoAccount.
  ///
  /// In pt, this message translates to:
  /// **'Não tem conta? Registre-se'**
  String get messageNoAccount;

  /// No description provided for @messageHasAccount.
  ///
  /// In pt, this message translates to:
  /// **'Já tem conta? Faça login'**
  String get messageHasAccount;

  /// No description provided for @messageLanguageAvailable.
  ///
  /// In pt, this message translates to:
  /// **'Linguagem disponível para uso'**
  String get messageLanguageAvailable;

  /// No description provided for @messageMaterialOld.
  ///
  /// In pt, this message translates to:
  /// **'Marcar se este material está desatualizado'**
  String get messageMaterialOld;

  /// No description provided for @messageZipSaved.
  ///
  /// In pt, this message translates to:
  /// **'ZIP salvo em: {path}'**
  String messageZipSaved(String path);

  /// No description provided for @messagePageOf.
  ///
  /// In pt, this message translates to:
  /// **'Página {current} de {total}'**
  String messagePageOf(int current, int total);

  /// No description provided for @messageId.
  ///
  /// In pt, this message translates to:
  /// **'ID: {id}'**
  String messageId(String id);

  /// No description provided for @messageCode.
  ///
  /// In pt, this message translates to:
  /// **'Código: {code}'**
  String messageCode(String code);

  /// No description provided for @messageMaxZipSize.
  ///
  /// In pt, this message translates to:
  /// **'{size} MB'**
  String messageMaxZipSize(int size);

  /// No description provided for @sectionTags.
  ///
  /// In pt, this message translates to:
  /// **'Etiquetas'**
  String get sectionTags;

  /// No description provided for @sectionMaterials.
  ///
  /// In pt, this message translates to:
  /// **'Materiais'**
  String get sectionMaterials;

  /// No description provided for @sectionReviewHistory.
  ///
  /// In pt, this message translates to:
  /// **'Histórico de Revisão'**
  String get sectionReviewHistory;

  /// No description provided for @statusInReview.
  ///
  /// In pt, this message translates to:
  /// **'Em Revisão'**
  String get statusInReview;

  /// No description provided for @statusLoading.
  ///
  /// In pt, this message translates to:
  /// **'Carregando...'**
  String get statusLoading;

  /// No description provided for @statusDownloadingZip.
  ///
  /// In pt, this message translates to:
  /// **'Baixando ZIP...'**
  String get statusDownloadingZip;

  /// No description provided for @badgeInReview.
  ///
  /// In pt, this message translates to:
  /// **'Em Revisão'**
  String get badgeInReview;

  /// No description provided for @badgeOld.
  ///
  /// In pt, this message translates to:
  /// **'Antigo'**
  String get badgeOld;

  /// No description provided for @badgeNumber.
  ///
  /// In pt, this message translates to:
  /// **'#{number}'**
  String badgeNumber(int number);

  /// No description provided for @actionAddMaterial.
  ///
  /// In pt, this message translates to:
  /// **'Adicionar Material'**
  String get actionAddMaterial;

  /// No description provided for @actionEdit.
  ///
  /// In pt, this message translates to:
  /// **'Editar'**
  String get actionEdit;

  /// No description provided for @actionDelete.
  ///
  /// In pt, this message translates to:
  /// **'Excluir'**
  String get actionDelete;

  /// No description provided for @actionDownload.
  ///
  /// In pt, this message translates to:
  /// **'Baixar'**
  String get actionDownload;

  /// No description provided for @actionPlay.
  ///
  /// In pt, this message translates to:
  /// **'Reproduzir'**
  String get actionPlay;

  /// No description provided for @actionView.
  ///
  /// In pt, this message translates to:
  /// **'Visualizar'**
  String get actionView;

  /// No description provided for @actionStartReview.
  ///
  /// In pt, this message translates to:
  /// **'Iniciar Revisão'**
  String get actionStartReview;

  /// No description provided for @actionCancelReview.
  ///
  /// In pt, this message translates to:
  /// **'Cancelar Revisão'**
  String get actionCancelReview;

  /// No description provided for @actionFinishReview.
  ///
  /// In pt, this message translates to:
  /// **'Finalizar Revisão'**
  String get actionFinishReview;

  /// No description provided for @actionFilter.
  ///
  /// In pt, this message translates to:
  /// **'Filtrar'**
  String get actionFilter;

  /// No description provided for @actionAll.
  ///
  /// In pt, this message translates to:
  /// **'Todas'**
  String get actionAll;

  /// No description provided for @actionViewOldMaterials.
  ///
  /// In pt, this message translates to:
  /// **'Ver Antigos'**
  String get actionViewOldMaterials;

  /// No description provided for @actionHideOldMaterials.
  ///
  /// In pt, this message translates to:
  /// **'Ocultar Antigos'**
  String get actionHideOldMaterials;

  /// No description provided for @actionAddTranslation.
  ///
  /// In pt, this message translates to:
  /// **'Adicionar Tradução'**
  String get actionAddTranslation;

  /// No description provided for @actionNewList.
  ///
  /// In pt, this message translates to:
  /// **'Nova Lista'**
  String get actionNewList;

  /// No description provided for @actionCreateFirstList.
  ///
  /// In pt, this message translates to:
  /// **'Criar primeira lista'**
  String get actionCreateFirstList;

  /// No description provided for @actionFollow.
  ///
  /// In pt, this message translates to:
  /// **'Seguir'**
  String get actionFollow;

  /// No description provided for @actionUnfollow.
  ///
  /// In pt, this message translates to:
  /// **'Deixar de Seguir'**
  String get actionUnfollow;

  /// No description provided for @actionCopy.
  ///
  /// In pt, this message translates to:
  /// **'Copiar'**
  String get actionCopy;

  /// No description provided for @actionCopyList.
  ///
  /// In pt, this message translates to:
  /// **'Copiar Lista'**
  String get actionCopyList;

  /// No description provided for @actionAddToList.
  ///
  /// In pt, this message translates to:
  /// **'Adicionar à Lista'**
  String get actionAddToList;

  /// No description provided for @actionRemoveFromList.
  ///
  /// In pt, this message translates to:
  /// **'Remover da Lista'**
  String get actionRemoveFromList;

  /// No description provided for @actionMoveUp.
  ///
  /// In pt, this message translates to:
  /// **'Mover para Cima'**
  String get actionMoveUp;

  /// No description provided for @actionMoveDown.
  ///
  /// In pt, this message translates to:
  /// **'Mover para Baixo'**
  String get actionMoveDown;

  /// No description provided for @actionClearFilters.
  ///
  /// In pt, this message translates to:
  /// **'Limpar Filtros'**
  String get actionClearFilters;

  /// No description provided for @dialogTitleConfirmDelete.
  ///
  /// In pt, this message translates to:
  /// **'Confirmar Exclusão'**
  String get dialogTitleConfirmDelete;

  /// No description provided for @dialogTitleStartReview.
  ///
  /// In pt, this message translates to:
  /// **'Iniciar Revisão'**
  String get dialogTitleStartReview;

  /// No description provided for @dialogTitleDownloadZip.
  ///
  /// In pt, this message translates to:
  /// **'Baixar Louvor em ZIP'**
  String get dialogTitleDownloadZip;

  /// No description provided for @dialogMessageDeletePraise.
  ///
  /// In pt, this message translates to:
  /// **'Tem certeza que deseja excluir este louvor? Esta ação não pode ser desfeita.'**
  String get dialogMessageDeletePraise;

  /// No description provided for @dialogMessageDeleteTag.
  ///
  /// In pt, this message translates to:
  /// **'Tem certeza que deseja excluir esta etiqueta?'**
  String get dialogMessageDeleteTag;

  /// No description provided for @dialogMessageDeleteMaterialKind.
  ///
  /// In pt, this message translates to:
  /// **'Tem certeza que deseja excluir esta categoria do material?'**
  String get dialogMessageDeleteMaterialKind;

  /// No description provided for @dialogMessageDeleteMaterialType.
  ///
  /// In pt, this message translates to:
  /// **'Tem certeza que deseja excluir este tipo do material?'**
  String get dialogMessageDeleteMaterialType;

  /// No description provided for @dialogMessageDeleteLanguage.
  ///
  /// In pt, this message translates to:
  /// **'Tem certeza que deseja excluir esta linguagem?'**
  String get dialogMessageDeleteLanguage;

  /// No description provided for @dialogMessageDeleteTranslation.
  ///
  /// In pt, this message translates to:
  /// **'Tem certeza que deseja excluir esta tradução?'**
  String get dialogMessageDeleteTranslation;

  /// No description provided for @dialogMessageDeleteMaterial.
  ///
  /// In pt, this message translates to:
  /// **'Tem certeza que deseja excluir este material?'**
  String get dialogMessageDeleteMaterial;

  /// No description provided for @dialogMessageDeletePraiseList.
  ///
  /// In pt, this message translates to:
  /// **'Tem certeza que deseja excluir esta lista? Esta ação não pode ser desfeita.'**
  String get dialogMessageDeletePraiseList;

  /// No description provided for @dialogMessageRemovePraiseFromList.
  ///
  /// In pt, this message translates to:
  /// **'Tem certeza que deseja remover este louvor da lista?'**
  String get dialogMessageRemovePraiseFromList;

  /// No description provided for @dialogMessageNoFileMaterials.
  ///
  /// In pt, this message translates to:
  /// **'Este louvor não possui materiais de arquivo para download'**
  String get dialogMessageNoFileMaterials;

  /// No description provided for @dialogLabelReviewDescription.
  ///
  /// In pt, this message translates to:
  /// **'Descrição (opcional)'**
  String get dialogLabelReviewDescription;

  /// No description provided for @errorConnectionFailed.
  ///
  /// In pt, this message translates to:
  /// **'Não foi possível conectar ao servidor.\nVerifique se o backend está rodando.'**
  String get errorConnectionFailed;

  /// No description provided for @errorInvalidCredentials.
  ///
  /// In pt, this message translates to:
  /// **'Usuário ou senha incorretos'**
  String get errorInvalidCredentials;

  /// No description provided for @errorLogin.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao fazer login: {error}'**
  String errorLogin(String error);

  /// No description provided for @errorRegister.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao registrar: {error}'**
  String errorRegister(String error);

  /// No description provided for @errorSelectFile.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao selecionar arquivo: {error}'**
  String errorSelectFile(String error);

  /// No description provided for @errorSaveMaterial.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao salvar material: {error}'**
  String errorSaveMaterial(String error);

  /// No description provided for @errorDeleteMaterial.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao excluir material: {error}'**
  String errorDeleteMaterial(String error);

  /// No description provided for @errorLoadMaterials.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao carregar materiais: {error}'**
  String errorLoadMaterials(String error);

  /// No description provided for @errorDownloadZip.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao baixar ZIP: {error}'**
  String errorDownloadZip(String error);

  /// No description provided for @errorLoadPraise.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao carregar o louvor: {error}'**
  String errorLoadPraise(String error);

  /// No description provided for @errorLoadMaterialKind.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao carregar categoria do material: {error}'**
  String errorLoadMaterialKind(String error);

  /// No description provided for @errorLoadMaterialType.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao carregar tipo do material: {error}'**
  String errorLoadMaterialType(String error);

  /// No description provided for @errorLoadAudio.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao carregar áudio: {error}'**
  String errorLoadAudio(String error);

  /// No description provided for @errorLoadPdf.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao carregar PDF'**
  String get errorLoadPdf;

  /// No description provided for @errorCreatePraise.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao criar o louvor: {error}'**
  String errorCreatePraise(String error);

  /// No description provided for @errorUpdatePraise.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao atualizar o louvor: {error}'**
  String errorUpdatePraise(String error);

  /// No description provided for @errorDeletePraise.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao excluir: {error}'**
  String errorDeletePraise(String error);

  /// No description provided for @errorStartReview.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao iniciar revisão: {error}'**
  String errorStartReview(String error);

  /// No description provided for @errorCancelReview.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao cancelar revisão: {error}'**
  String errorCancelReview(String error);

  /// No description provided for @errorFinishReview.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao finalizar revisão: {error}'**
  String errorFinishReview(String error);

  /// No description provided for @errorSaveTag.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao salvar etiqueta: {error}'**
  String errorSaveTag(String error);

  /// No description provided for @errorDeleteTag.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao excluir etiqueta: {error}'**
  String errorDeleteTag(String error);

  /// No description provided for @errorSaveMaterialKind.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao salvar categoria do material: {error}'**
  String errorSaveMaterialKind(String error);

  /// No description provided for @errorDeleteMaterialKind.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao excluir categoria do material: {error}'**
  String errorDeleteMaterialKind(String error);

  /// No description provided for @errorSaveMaterialType.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao salvar tipo do material: {error}'**
  String errorSaveMaterialType(String error);

  /// No description provided for @errorDeleteMaterialType.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao excluir tipo do material: {error}'**
  String errorDeleteMaterialType(String error);

  /// No description provided for @errorSaveLanguage.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao salvar linguagem: {error}'**
  String errorSaveLanguage(String error);

  /// No description provided for @errorDeleteLanguage.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao excluir linguagem: {error}'**
  String errorDeleteLanguage(String error);

  /// No description provided for @errorDeleteTranslation.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao excluir tradução: {error}'**
  String errorDeleteTranslation(String error);

  /// No description provided for @errorSaveTranslation.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao salvar tradução: {error}'**
  String errorSaveTranslation(String error);

  /// No description provided for @errorLoadTranslation.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao carregar tradução: {error}'**
  String errorLoadTranslation(String error);

  /// No description provided for @errorLoadPraiseList.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao carregar lista: {error}'**
  String errorLoadPraiseList(Object error);

  /// No description provided for @errorCreatePraiseList.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao criar lista: {error}'**
  String errorCreatePraiseList(Object error);

  /// No description provided for @errorUpdatePraiseList.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao atualizar lista: {error}'**
  String errorUpdatePraiseList(Object error);

  /// No description provided for @errorDeletePraiseList.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao excluir lista: {error}'**
  String errorDeletePraiseList(Object error);

  /// No description provided for @errorAddPraiseToList.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao adicionar louvor à lista: {error}'**
  String errorAddPraiseToList(Object error);

  /// No description provided for @errorRemovePraiseFromList.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao remover louvor da lista: {error}'**
  String errorRemovePraiseFromList(Object error);

  /// No description provided for @errorFollowList.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao seguir lista: {error}'**
  String errorFollowList(Object error);

  /// No description provided for @errorUnfollowList.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao deixar de seguir lista: {error}'**
  String errorUnfollowList(Object error);

  /// No description provided for @errorCopyList.
  ///
  /// In pt, this message translates to:
  /// **'Erro ao copiar lista: {error}'**
  String errorCopyList(Object error);

  /// No description provided for @errorNeedCreatePraiseFirst.
  ///
  /// In pt, this message translates to:
  /// **'É necessário criar o louvor primeiro'**
  String get errorNeedCreatePraiseFirst;

  /// No description provided for @errorDownloadCanceled.
  ///
  /// In pt, this message translates to:
  /// **'Download cancelado'**
  String get errorDownloadCanceled;

  /// No description provided for @successRegister.
  ///
  /// In pt, this message translates to:
  /// **'Registro realizado com sucesso! Faça login.'**
  String get successRegister;

  /// No description provided for @successPraiseCreated.
  ///
  /// In pt, this message translates to:
  /// **'Louvor criado com sucesso. Você pode adicionar materiais na página de edição.'**
  String get successPraiseCreated;

  /// No description provided for @successPraiseUpdated.
  ///
  /// In pt, this message translates to:
  /// **'Louvor atualizado com sucesso'**
  String get successPraiseUpdated;

  /// No description provided for @successPraiseDeleted.
  ///
  /// In pt, this message translates to:
  /// **'Louvor excluído com sucesso'**
  String get successPraiseDeleted;

  /// No description provided for @successReviewStarted.
  ///
  /// In pt, this message translates to:
  /// **'Revisão iniciada com sucesso'**
  String get successReviewStarted;

  /// No description provided for @successReviewCanceled.
  ///
  /// In pt, this message translates to:
  /// **'Revisão cancelada com sucesso'**
  String get successReviewCanceled;

  /// No description provided for @successReviewFinished.
  ///
  /// In pt, this message translates to:
  /// **'Revisão finalizada com sucesso'**
  String get successReviewFinished;

  /// No description provided for @successMaterialDeleted.
  ///
  /// In pt, this message translates to:
  /// **'Material excluído com sucesso'**
  String get successMaterialDeleted;

  /// No description provided for @successTagSaved.
  ///
  /// In pt, this message translates to:
  /// **'Etiqueta salva com sucesso'**
  String get successTagSaved;

  /// No description provided for @successTagDeleted.
  ///
  /// In pt, this message translates to:
  /// **'Etiqueta excluída com sucesso'**
  String get successTagDeleted;

  /// No description provided for @successMaterialKindSaved.
  ///
  /// In pt, this message translates to:
  /// **'categoria do material salvo com sucesso'**
  String get successMaterialKindSaved;

  /// No description provided for @successMaterialKindDeleted.
  ///
  /// In pt, this message translates to:
  /// **'categoria do material excluído com sucesso'**
  String get successMaterialKindDeleted;

  /// No description provided for @successMaterialTypeSaved.
  ///
  /// In pt, this message translates to:
  /// **'Tipo do Material salvo com sucesso'**
  String get successMaterialTypeSaved;

  /// No description provided for @successMaterialTypeDeleted.
  ///
  /// In pt, this message translates to:
  /// **'Tipo do Material excluído com sucesso'**
  String get successMaterialTypeDeleted;

  /// No description provided for @successLanguageSaved.
  ///
  /// In pt, this message translates to:
  /// **'Linguagem salva com sucesso'**
  String get successLanguageSaved;

  /// No description provided for @successLanguageDeleted.
  ///
  /// In pt, this message translates to:
  /// **'Linguagem excluída com sucesso'**
  String get successLanguageDeleted;

  /// No description provided for @successTranslationSaved.
  ///
  /// In pt, this message translates to:
  /// **'Tradução salva com sucesso'**
  String get successTranslationSaved;

  /// No description provided for @successTranslationDeleted.
  ///
  /// In pt, this message translates to:
  /// **'Tradução excluída com sucesso'**
  String get successTranslationDeleted;

  /// No description provided for @successPraiseListCreated.
  ///
  /// In pt, this message translates to:
  /// **'Lista criada com sucesso'**
  String get successPraiseListCreated;

  /// No description provided for @successPraiseListUpdated.
  ///
  /// In pt, this message translates to:
  /// **'Lista atualizada com sucesso'**
  String get successPraiseListUpdated;

  /// No description provided for @successPraiseListDeleted.
  ///
  /// In pt, this message translates to:
  /// **'Lista excluída com sucesso'**
  String get successPraiseListDeleted;

  /// No description provided for @successPraiseAddedToList.
  ///
  /// In pt, this message translates to:
  /// **'Louvor adicionado à lista com sucesso'**
  String get successPraiseAddedToList;

  /// No description provided for @successPraiseRemovedFromList.
  ///
  /// In pt, this message translates to:
  /// **'Louvor removido da lista com sucesso'**
  String get successPraiseRemovedFromList;

  /// No description provided for @successListFollowed.
  ///
  /// In pt, this message translates to:
  /// **'Lista seguida com sucesso'**
  String get successListFollowed;

  /// No description provided for @successListUnfollowed.
  ///
  /// In pt, this message translates to:
  /// **'Deixou de seguir a lista com sucesso'**
  String get successListUnfollowed;

  /// No description provided for @successListCopied.
  ///
  /// In pt, this message translates to:
  /// **'Lista copiada com sucesso'**
  String get successListCopied;

  /// No description provided for @enumMaterialFormTypeFile.
  ///
  /// In pt, this message translates to:
  /// **'Arquivo'**
  String get enumMaterialFormTypeFile;

  /// No description provided for @enumMaterialFormTypeYoutube.
  ///
  /// In pt, this message translates to:
  /// **'YouTube'**
  String get enumMaterialFormTypeYoutube;

  /// No description provided for @enumMaterialFormTypeSpotify.
  ///
  /// In pt, this message translates to:
  /// **'Spotify'**
  String get enumMaterialFormTypeSpotify;

  /// No description provided for @enumMaterialFormTypeText.
  ///
  /// In pt, this message translates to:
  /// **'Texto'**
  String get enumMaterialFormTypeText;

  /// No description provided for @enumRoomAccessTypePublic.
  ///
  /// In pt, this message translates to:
  /// **'Público'**
  String get enumRoomAccessTypePublic;

  /// No description provided for @enumRoomAccessTypePassword.
  ///
  /// In pt, this message translates to:
  /// **'Com Senha'**
  String get enumRoomAccessTypePassword;

  /// No description provided for @enumRoomAccessTypeApproval.
  ///
  /// In pt, this message translates to:
  /// **'Com Aprovação'**
  String get enumRoomAccessTypeApproval;

  /// No description provided for @enumRoomJoinRequestStatusPending.
  ///
  /// In pt, this message translates to:
  /// **'Pendente'**
  String get enumRoomJoinRequestStatusPending;

  /// No description provided for @enumRoomJoinRequestStatusApproved.
  ///
  /// In pt, this message translates to:
  /// **'Aprovado'**
  String get enumRoomJoinRequestStatusApproved;

  /// No description provided for @enumRoomJoinRequestStatusRejected.
  ///
  /// In pt, this message translates to:
  /// **'Rejeitado'**
  String get enumRoomJoinRequestStatusRejected;

  /// No description provided for @reviewActionStart.
  ///
  /// In pt, this message translates to:
  /// **'Iniciar'**
  String get reviewActionStart;

  /// No description provided for @reviewActionCancel.
  ///
  /// In pt, this message translates to:
  /// **'Cancelar'**
  String get reviewActionCancel;

  /// No description provided for @reviewActionFinish.
  ///
  /// In pt, this message translates to:
  /// **'Finalizar'**
  String get reviewActionFinish;

  /// No description provided for @tooltipDownloadZip.
  ///
  /// In pt, this message translates to:
  /// **'Baixar ZIP'**
  String get tooltipDownloadZip;

  /// No description provided for @tooltipEdit.
  ///
  /// In pt, this message translates to:
  /// **'Editar'**
  String get tooltipEdit;

  /// No description provided for @tooltipDelete.
  ///
  /// In pt, this message translates to:
  /// **'Excluir'**
  String get tooltipDelete;

  /// No description provided for @drawerUser.
  ///
  /// In pt, this message translates to:
  /// **'Usuário'**
  String get drawerUser;

  /// No description provided for @drawerDashboard.
  ///
  /// In pt, this message translates to:
  /// **'Dashboard'**
  String get drawerDashboard;

  /// No description provided for @drawerPraises.
  ///
  /// In pt, this message translates to:
  /// **'Louvores'**
  String get drawerPraises;

  /// No description provided for @drawerTags.
  ///
  /// In pt, this message translates to:
  /// **'Etiquetas'**
  String get drawerTags;

  /// No description provided for @drawerLanguages.
  ///
  /// In pt, this message translates to:
  /// **'Linguagens'**
  String get drawerLanguages;

  /// No description provided for @drawerLanguage.
  ///
  /// In pt, this message translates to:
  /// **'Idioma'**
  String get drawerLanguage;

  /// No description provided for @drawerMaterialKinds.
  ///
  /// In pt, this message translates to:
  /// **'Categorias do Material'**
  String get drawerMaterialKinds;

  /// No description provided for @drawerMaterialTypes.
  ///
  /// In pt, this message translates to:
  /// **'Tipos do Material'**
  String get drawerMaterialTypes;

  /// No description provided for @drawerTranslations.
  ///
  /// In pt, this message translates to:
  /// **'Traduções'**
  String get drawerTranslations;

  /// No description provided for @drawerPraiseLists.
  ///
  /// In pt, this message translates to:
  /// **'Listas de Louvores'**
  String get drawerPraiseLists;

  /// No description provided for @drawerLogout.
  ///
  /// In pt, this message translates to:
  /// **'Sair'**
  String get drawerLogout;

  /// No description provided for @languagePortuguese.
  ///
  /// In pt, this message translates to:
  /// **'Português'**
  String get languagePortuguese;

  /// No description provided for @languageEnglish.
  ///
  /// In pt, this message translates to:
  /// **'Inglês'**
  String get languageEnglish;

  /// No description provided for @languageCurrent.
  ///
  /// In pt, this message translates to:
  /// **'Idioma atual: {name}'**
  String languageCurrent(String name);

  /// No description provided for @cardPraises.
  ///
  /// In pt, this message translates to:
  /// **'Louvores'**
  String get cardPraises;

  /// No description provided for @cardTags.
  ///
  /// In pt, this message translates to:
  /// **'Etiquetas'**
  String get cardTags;

  /// No description provided for @cardMaterialKinds.
  ///
  /// In pt, this message translates to:
  /// **'Categorias do Material'**
  String get cardMaterialKinds;

  /// No description provided for @cardDownloadByMaterialKind.
  ///
  /// In pt, this message translates to:
  /// **'Baixar por Categoria do Material'**
  String get cardDownloadByMaterialKind;

  /// No description provided for @cardLists.
  ///
  /// In pt, this message translates to:
  /// **'Listas'**
  String get cardLists;

  /// No description provided for @labelPraisesCount.
  ///
  /// In pt, this message translates to:
  /// **'{count} louvor(es)'**
  String labelPraisesCount(int count);

  /// No description provided for @labelBy.
  ///
  /// In pt, this message translates to:
  /// **'por'**
  String get labelBy;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'pt'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'pt':
      return AppLocalizationsPt();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
