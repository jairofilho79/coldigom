// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Portuguese (`pt`).
class AppLocalizationsPt extends AppLocalizations {
  AppLocalizationsPt([String locale = 'pt']) : super(locale);

  @override
  String get appName => 'Coldigom';

  @override
  String get appSubtitle => 'Gerenciamento de Louvores';

  @override
  String get buttonBack => 'Voltar';

  @override
  String get buttonEdit => 'Editar';

  @override
  String get buttonDelete => 'Deletar';

  @override
  String get buttonSave => 'Salvar';

  @override
  String get buttonCancel => 'Cancelar';

  @override
  String get buttonCreate => 'Criar';

  @override
  String get buttonUpdate => 'Atualizar';

  @override
  String get buttonConfirm => 'Confirmar';

  @override
  String get buttonClose => 'Fechar';

  @override
  String get buttonLogout => 'Sair';

  @override
  String get buttonRemoveFilter => 'Remover Filtro';

  @override
  String get buttonDownload => 'Baixar';

  @override
  String get buttonDownloading => 'Baixando...';

  @override
  String get buttonDownloadByMaterialKind => 'Baixar por Material Kind';

  @override
  String get buttonDownloadZip => 'Download ZIP';

  @override
  String get buttonEnter => 'Entrar';

  @override
  String get buttonRegister => 'Registrar';

  @override
  String get buttonTryAgain => 'Tentar Novamente';

  @override
  String get labelTags => 'Tags';

  @override
  String get labelMaterials => 'Materiais';

  @override
  String get labelName => 'Nome';

  @override
  String get labelEmail => 'Email';

  @override
  String get labelPassword => 'Senha';

  @override
  String get labelConfirmPassword => 'Confirmar Senha';

  @override
  String get labelUsername => 'Usuário';

  @override
  String get labelType => 'Tipo';

  @override
  String get labelMaterialKind => 'Tipo de Material';

  @override
  String get labelMaterialType => 'Tipo de Material';

  @override
  String get labelPath => 'Caminho';

  @override
  String get labelSearch => 'Buscar';

  @override
  String get labelPraiseName => 'Nome do Louvor';

  @override
  String get labelNumber => 'Número';

  @override
  String get labelNumberOptional => 'Número (opcional)';

  @override
  String get labelFileType => 'Tipo de Arquivo';

  @override
  String get labelCode => 'Código';

  @override
  String get labelText => 'Texto';

  @override
  String get labelUrl => 'URL';

  @override
  String get labelActive => 'Ativa';

  @override
  String get labelMaterialKindRequired => 'Material Kind *';

  @override
  String get labelMaterialTypeRequired => 'Tipo de Material *';

  @override
  String get labelSelectMaterialKind => 'Selecione o Material Kind';

  @override
  String get labelSelectFile => 'Selecionar Arquivo';

  @override
  String get labelSelectNewFile => 'Selecionar Novo Arquivo';

  @override
  String get labelCurrentFile => 'Arquivo Atual';

  @override
  String get labelMaxZipSize => 'Tamanho máximo por ZIP (MB)';

  @override
  String get labelMaterialIsOld => 'Material Antigo';

  @override
  String get labelMaterialOldDescription => 'Descrição do Material Antigo';

  @override
  String get labelSelectTag => 'Selecione uma tag (opcional)';

  @override
  String get labelSelectMaterialKindForDownload => 'Selecione um Material Kind';

  @override
  String get hintEnterUsername => 'Digite seu usuário';

  @override
  String get hintEnterPassword => 'Digite sua senha';

  @override
  String get hintEnterEmail => 'Digite seu email';

  @override
  String get hintConfirmPassword => 'Confirme sua senha';

  @override
  String get hintEnterPraiseName => 'Digite o nome do praise';

  @override
  String get hintEnterPraiseNumber => 'Digite o número do praise (opcional)';

  @override
  String get hintEnterTagName => 'Digite o nome da tag';

  @override
  String get hintEnterMaterialKindName => 'Digite o nome do material kind';

  @override
  String get hintEnterMaterialTypeName => 'Digite o nome do material type';

  @override
  String get hintEnterLanguageCode => 'Ex: pt-BR, en-US';

  @override
  String get hintEnterLanguageName => 'Digite o nome da linguagem';

  @override
  String get hintEnterSearchPraise => 'Digite o nome do praise...';

  @override
  String hintEnterUrl(String platform) {
    return 'Cole a URL do $platform';
  }

  @override
  String get hintEnterText => 'Digite o texto do material';

  @override
  String get hintEnterOldDescription =>
      'Descreva por que este material está antigo (opcional)';

  @override
  String get hintEnterReviewDescription => 'Descreva o motivo da revisão...';

  @override
  String get hintSelectFile => 'Selecione um arquivo PDF ou de áudio';

  @override
  String get hintSelectNewFileToReplace =>
      'Selecione um novo arquivo para substituir';

  @override
  String get validationRequired => 'Este campo é obrigatório';

  @override
  String validationMinLength(int min) {
    return 'Mínimo de $min caracteres';
  }

  @override
  String validationMaxLength(int max) {
    return 'Máximo de $max caracteres';
  }

  @override
  String get validationEnterUsername => 'Por favor, digite seu usuário';

  @override
  String get validationEnterPassword => 'Por favor, digite sua senha';

  @override
  String get validationEnterEmail => 'Por favor, digite seu email';

  @override
  String get validationValidEmail => 'Por favor, digite um email válido';

  @override
  String get validationUsernameMinLength =>
      'Usuário deve ter pelo menos 3 caracteres';

  @override
  String get validationPasswordMinLength =>
      'Senha deve ter pelo menos 6 caracteres';

  @override
  String get validationConfirmPassword => 'Por favor, confirme sua senha';

  @override
  String get validationPasswordMismatch => 'As senhas não coincidem';

  @override
  String get validationUrlRequired => 'URL é obrigatória';

  @override
  String get validationUrlInvalid => 'URL inválida';

  @override
  String get validationTextRequired => 'Texto é obrigatório';

  @override
  String get validationMaterialKindRequired => 'Material Kind é obrigatório';

  @override
  String get validationSelectMaterialType => 'Selecione o tipo de material';

  @override
  String get validationSelectMaterialKind => 'Selecione o Material Kind';

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
  String get pageTitleLanguages => 'Linguagens';

  @override
  String get pageTitleCreatePraise => 'Criar Praise';

  @override
  String get pageTitleEditPraise => 'Editar Praise';

  @override
  String get pageTitlePraiseDetails => 'Detalhes do Praise';

  @override
  String get pageTitleRegister => 'Registro';

  @override
  String get pageTitleCreateTag => 'Criar Tag';

  @override
  String get pageTitleEditTag => 'Editar Tag';

  @override
  String get pageTitleCreateMaterialKind => 'Criar Material Kind';

  @override
  String get pageTitleEditMaterialKind => 'Editar Material Kind';

  @override
  String get pageTitleCreateMaterialType => 'Criar Material Type';

  @override
  String get pageTitleEditMaterialType => 'Editar Material Type';

  @override
  String get pageTitleCreateLanguage => 'Criar Linguagem';

  @override
  String get pageTitleEditLanguage => 'Editar Linguagem';

  @override
  String messageWelcome(String username) {
    return 'Bem-vindo, $username!';
  }

  @override
  String get messageNotAuthenticated => 'Não autenticado';

  @override
  String get messageNoTagsAvailable => 'Nenhuma tag disponível';

  @override
  String get messageNoMaterialsAdded => 'Nenhum material adicionado';

  @override
  String get messageNoMaterialKindsAvailable =>
      'Nenhum Material Kind disponível';

  @override
  String get messageNoTagsForFilter => 'Nenhuma tag (todos os praises)';

  @override
  String get messageNoMaterials => 'Nenhum material cadastrado';

  @override
  String get messageCreatePraiseFirst => 'É necessário criar o praise primeiro';

  @override
  String get messageFileSelected =>
      'Novo arquivo selecionado. O arquivo atual será substituído.';

  @override
  String messageNewFile(String fileName) {
    return 'Novo Arquivo: $fileName';
  }

  @override
  String messageVersion(String version, String buildNumber) {
    return 'Versão: $version ($buildNumber)';
  }

  @override
  String messageBuild(String date) {
    return 'Build: $date';
  }

  @override
  String get messageNoAccount => 'Não tem conta? Registre-se';

  @override
  String get messageHasAccount => 'Já tem conta? Faça login';

  @override
  String get messageLanguageAvailable => 'Linguagem disponível para uso';

  @override
  String get messageMaterialOld => 'Marcar se este material está desatualizado';

  @override
  String messageZipSaved(String path) {
    return 'ZIP salvo em: $path';
  }

  @override
  String messagePageOf(int current, int total) {
    return 'Página $current de $total';
  }

  @override
  String messageId(String id) {
    return 'ID: $id';
  }

  @override
  String messageCode(String code) {
    return 'Código: $code';
  }

  @override
  String messageMaxZipSize(int size) {
    return '$size MB';
  }

  @override
  String get sectionTags => 'Tags';

  @override
  String get sectionMaterials => 'Materiais';

  @override
  String get sectionReviewHistory => 'Histórico de Revisão';

  @override
  String get statusInReview => 'Em Revisão';

  @override
  String get statusLoading => 'Carregando...';

  @override
  String get statusDownloadingZip => 'Baixando ZIP...';

  @override
  String get badgeInReview => 'Em Revisão';

  @override
  String get badgeOld => 'Antigo';

  @override
  String badgeNumber(int number) {
    return '#$number';
  }

  @override
  String get actionAddMaterial => 'Adicionar Material';

  @override
  String get actionEdit => 'Editar';

  @override
  String get actionDelete => 'Excluir';

  @override
  String get actionDownload => 'Baixar';

  @override
  String get actionPlay => 'Reproduzir';

  @override
  String get actionView => 'Visualizar';

  @override
  String get actionStartReview => 'Iniciar Revisão';

  @override
  String get actionCancelReview => 'Cancelar Revisão';

  @override
  String get actionFinishReview => 'Finalizar Revisão';

  @override
  String get actionFilter => 'Filtrar';

  @override
  String get actionAll => 'Todas';

  @override
  String get actionViewOldMaterials => 'Ver Antigos';

  @override
  String get actionHideOldMaterials => 'Ocultar Antigos';

  @override
  String get dialogTitleConfirmDelete => 'Confirmar Exclusão';

  @override
  String get dialogTitleStartReview => 'Iniciar Revisão';

  @override
  String get dialogTitleDownloadZip => 'Baixar Praise em ZIP';

  @override
  String get dialogMessageDeletePraise =>
      'Tem certeza que deseja excluir este praise? Esta ação não pode ser desfeita.';

  @override
  String get dialogMessageDeleteTag =>
      'Tem certeza que deseja excluir esta tag?';

  @override
  String get dialogMessageDeleteMaterialKind =>
      'Tem certeza que deseja excluir este material kind?';

  @override
  String get dialogMessageDeleteMaterialType =>
      'Tem certeza que deseja excluir este material type?';

  @override
  String get dialogMessageDeleteLanguage =>
      'Tem certeza que deseja excluir esta linguagem?';

  @override
  String get dialogMessageDeleteMaterial =>
      'Tem certeza que deseja excluir este material?';

  @override
  String get dialogMessageNoFileMaterials =>
      'Este praise não possui materiais de arquivo para download';

  @override
  String get dialogLabelReviewDescription => 'Descrição (opcional)';

  @override
  String get errorConnectionFailed =>
      'Não foi possível conectar ao servidor.\nVerifique se o backend está rodando em http://127.0.0.1:8000';

  @override
  String get errorInvalidCredentials => 'Usuário ou senha incorretos';

  @override
  String errorLogin(String error) {
    return 'Erro ao fazer login: $error';
  }

  @override
  String errorRegister(String error) {
    return 'Erro ao registrar: $error';
  }

  @override
  String errorSelectFile(String error) {
    return 'Erro ao selecionar arquivo: $error';
  }

  @override
  String errorSaveMaterial(String error) {
    return 'Erro ao salvar material: $error';
  }

  @override
  String errorDeleteMaterial(String error) {
    return 'Erro ao excluir material: $error';
  }

  @override
  String errorLoadMaterials(String error) {
    return 'Erro ao carregar materiais: $error';
  }

  @override
  String errorDownloadZip(String error) {
    return 'Erro ao baixar ZIP: $error';
  }

  @override
  String errorLoadPraise(String error) {
    return 'Erro ao carregar praise: $error';
  }

  @override
  String errorLoadMaterialKind(String error) {
    return 'Erro ao carregar material kind: $error';
  }

  @override
  String errorLoadMaterialType(String error) {
    return 'Erro ao carregar material type: $error';
  }

  @override
  String errorLoadAudio(String error) {
    return 'Erro ao carregar áudio: $error';
  }

  @override
  String get errorLoadPdf => 'Erro ao carregar PDF';

  @override
  String errorCreatePraise(String error) {
    return 'Erro ao criar praise: $error';
  }

  @override
  String errorUpdatePraise(String error) {
    return 'Erro ao atualizar praise: $error';
  }

  @override
  String errorDeletePraise(String error) {
    return 'Erro ao excluir: $error';
  }

  @override
  String errorStartReview(String error) {
    return 'Erro ao iniciar revisão: $error';
  }

  @override
  String errorCancelReview(String error) {
    return 'Erro ao cancelar revisão: $error';
  }

  @override
  String errorFinishReview(String error) {
    return 'Erro ao finalizar revisão: $error';
  }

  @override
  String errorSaveTag(String error) {
    return 'Erro ao salvar tag: $error';
  }

  @override
  String errorDeleteTag(String error) {
    return 'Erro ao excluir tag: $error';
  }

  @override
  String errorSaveMaterialKind(String error) {
    return 'Erro ao salvar material kind: $error';
  }

  @override
  String errorDeleteMaterialKind(String error) {
    return 'Erro ao excluir material kind: $error';
  }

  @override
  String errorSaveMaterialType(String error) {
    return 'Erro ao salvar material type: $error';
  }

  @override
  String errorDeleteMaterialType(String error) {
    return 'Erro ao excluir material type: $error';
  }

  @override
  String errorSaveLanguage(String error) {
    return 'Erro ao salvar linguagem: $error';
  }

  @override
  String errorDeleteLanguage(String error) {
    return 'Erro ao excluir linguagem: $error';
  }

  @override
  String get errorNeedCreatePraiseFirst =>
      'É necessário criar o praise primeiro';

  @override
  String get errorDownloadCanceled => 'Download cancelado';

  @override
  String get successRegister => 'Registro realizado com sucesso! Faça login.';

  @override
  String get successPraiseCreated =>
      'Praise criado com sucesso. Você pode adicionar materiais na página de edição.';

  @override
  String get successPraiseUpdated => 'Praise atualizado com sucesso';

  @override
  String get successPraiseDeleted => 'Praise excluído com sucesso';

  @override
  String get successReviewStarted => 'Revisão iniciada com sucesso';

  @override
  String get successReviewCanceled => 'Revisão cancelada com sucesso';

  @override
  String get successReviewFinished => 'Revisão finalizada com sucesso';

  @override
  String get successMaterialDeleted => 'Material excluído com sucesso';

  @override
  String get successTagSaved => 'Tag salva com sucesso';

  @override
  String get successTagDeleted => 'Tag excluída com sucesso';

  @override
  String get successMaterialKindSaved => 'Material kind salvo com sucesso';

  @override
  String get successMaterialKindDeleted => 'Material kind excluído com sucesso';

  @override
  String get successMaterialTypeSaved => 'Material type salvo com sucesso';

  @override
  String get successMaterialTypeDeleted => 'Material type excluído com sucesso';

  @override
  String get successLanguageSaved => 'Linguagem salva com sucesso';

  @override
  String get successLanguageDeleted => 'Linguagem excluída com sucesso';

  @override
  String get enumMaterialFormTypeFile => 'Arquivo';

  @override
  String get enumMaterialFormTypeYoutube => 'YouTube';

  @override
  String get enumMaterialFormTypeSpotify => 'Spotify';

  @override
  String get enumMaterialFormTypeText => 'Texto';

  @override
  String get enumRoomAccessTypePublic => 'Público';

  @override
  String get enumRoomAccessTypePassword => 'Com Senha';

  @override
  String get enumRoomAccessTypeApproval => 'Com Aprovação';

  @override
  String get enumRoomJoinRequestStatusPending => 'Pendente';

  @override
  String get enumRoomJoinRequestStatusApproved => 'Aprovado';

  @override
  String get enumRoomJoinRequestStatusRejected => 'Rejeitado';

  @override
  String get reviewActionStart => 'Iniciar';

  @override
  String get reviewActionCancel => 'Cancelar';

  @override
  String get reviewActionFinish => 'Finalizar';

  @override
  String get tooltipDownloadZip => 'Baixar ZIP';

  @override
  String get tooltipEdit => 'Editar';

  @override
  String get tooltipDelete => 'Excluir';

  @override
  String get drawerUser => 'Usuário';

  @override
  String get drawerDashboard => 'Dashboard';

  @override
  String get drawerPraises => 'Praises';

  @override
  String get drawerTags => 'Tags';

  @override
  String get drawerLanguages => 'Linguagens';

  @override
  String get drawerLanguage => 'Idioma';

  @override
  String get drawerMaterialKinds => 'Material Kinds';

  @override
  String get drawerMaterialTypes => 'Material Types';

  @override
  String get drawerLogout => 'Sair';

  @override
  String get languagePortuguese => 'Português';

  @override
  String get languageEnglish => 'Inglês';

  @override
  String languageCurrent(String name) {
    return 'Idioma atual: $name';
  }

  @override
  String get cardPraises => 'Praises';

  @override
  String get cardTags => 'Tags';

  @override
  String get cardMaterialKinds => 'Material Kinds';

  @override
  String get cardDownloadByMaterialKind => 'Baixar por Material Kind';

  @override
  String get cardLists => 'Listas';
}
