// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Portuguese (`pt`).
class AppLocalizationsPt extends AppLocalizations {
  AppLocalizationsPt([String locale = 'pt']) : super(locale);

  @override
  String get appName => 'Coletânea Digital';

  @override
  String get appSubtitle => 'com <3 pela ID (Irmãos da Maranata)';

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
  String get buttonDownloadZip => 'Baixar ZIP';

  @override
  String get buttonEnter => 'Entrar';

  @override
  String get buttonRegister => 'Registrar';

  @override
  String get buttonTryAgain => 'Tentar Novamente';

  @override
  String get labelTags => 'Etiquetas';

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
  String get labelMaterialKind => 'Categoria do Material';

  @override
  String get labelMaterialType => 'Tipo do Material';

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
  String get labelLanguage => 'Idioma';

  @override
  String get labelOriginal => 'Original';

  @override
  String get labelTranslatedName => 'Nome Traduzido';

  @override
  String get labelEntityType => 'Tipo de Entidade';

  @override
  String get labelFilters => 'Filtros';

  @override
  String get labelAllLanguages => 'Todos os idiomas';

  @override
  String get labelPraiseTag => 'Etiqueta do louvor';

  @override
  String get labelText => 'Texto';

  @override
  String get labelUrl => 'URL';

  @override
  String get labelActive => 'Ativa';

  @override
  String get labelMaterialKindRequired => 'Categoria do Material *';

  @override
  String get labelMaterialTypeRequired => 'Tipo do Material *';

  @override
  String get labelSelectMaterialKind => 'Selecione a categoria do material';

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
  String get labelSelectTag => 'Selecione uma etiqueta (opcional)';

  @override
  String get labelSelectMaterialKindForDownload =>
      'Selecione uma Categoria do Material';

  @override
  String get labelDescription => 'Descrição';

  @override
  String get labelPublic => 'Pública';

  @override
  String get labelPrivate => 'Privada';

  @override
  String get labelOwner => 'Dono';

  @override
  String get labelDateFrom => 'Data Inicial';

  @override
  String get labelDateTo => 'Data Final';

  @override
  String get hintEnterUsername => 'Digite seu usuário';

  @override
  String get hintEnterPassword => 'Digite sua senha';

  @override
  String get hintEnterEmail => 'Digite seu email';

  @override
  String get hintConfirmPassword => 'Confirme sua senha';

  @override
  String get hintEnterPraiseName => 'Digite o nome do louvor';

  @override
  String get hintEnterPraiseNumber => 'Digite o número do louvor (opcional)';

  @override
  String get hintEnterTagName => 'Digite o nome da etiqueta';

  @override
  String get hintEnterMaterialKindName =>
      'Digite o nome da Categoria do Material';

  @override
  String get hintEnterMaterialTypeName => 'Digite o nome do Tipo do Material';

  @override
  String get hintEnterLanguageCode => 'Ex: pt-BR, en-US';

  @override
  String get hintEnterLanguageName => 'Digite o nome da linguagem';

  @override
  String get hintEnterTranslatedName => 'Digite o nome traduzido';

  @override
  String get hintEnterSearchPraise => 'Digite o nome do louvor...';

  @override
  String get hintEnterListName => 'Digite o nome da lista';

  @override
  String get hintEnterListDescription =>
      'Digite a descrição da lista (opcional)';

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
  String get validationTranslatedNameRequired =>
      'O nome traduzido é obrigatório';

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
  String get validationMaterialKindRequired =>
      'Categoria do Material é obrigatório';

  @override
  String get validationSelectMaterialType => 'Selecione o Tipo do Material';

  @override
  String get validationSelectMaterialKind =>
      'Selecione a Categoria do Material';

  @override
  String get validationListNameRequired => 'Nome da lista é obrigatório';

  @override
  String get pageTitleDashboard => 'Início';

  @override
  String get pageTitlePraises => 'Louvores';

  @override
  String get pageTitleTags => 'Etiquetas';

  @override
  String get pageTitleMaterialKinds => 'Categorias do Material';

  @override
  String get pageTitleMaterialTypes => 'Tipos do Material';

  @override
  String get pageTitleLanguages => 'Linguagens';

  @override
  String get pageTitleCreatePraise => 'Criar Louvor';

  @override
  String get pageTitleEditPraise => 'Editar Louvor';

  @override
  String get pageTitlePraiseDetails => 'Detalhes do Louvor';

  @override
  String get pageTitleRegister => 'Registro';

  @override
  String get pageTitleCreateTag => 'Criar Etiqueta';

  @override
  String get pageTitleEditTag => 'Editar Etiqueta';

  @override
  String get pageTitleCreateMaterialKind => 'Criar Categoria do Material';

  @override
  String get pageTitleEditMaterialKind => 'Editar Categoria do Material';

  @override
  String get pageTitleCreateMaterialType => 'Criar Tipo do Material';

  @override
  String get pageTitleEditMaterialType => 'Editar Tipo do Material';

  @override
  String get pageTitleCreateLanguage => 'Criar Linguagem';

  @override
  String get pageTitleEditLanguage => 'Editar Linguagem';

  @override
  String get pageTitleTranslations => 'Traduções';

  @override
  String get pageTitleCreateTranslation => 'Criar Tradução';

  @override
  String get pageTitleEditTranslation => 'Editar Tradução';

  @override
  String get pageTitlePraiseLists => 'Listas de Louvores';

  @override
  String get pageTitlePraiseListDetail => 'Detalhes da Lista';

  @override
  String get pageTitlePraiseListCreate => 'Criar Lista';

  @override
  String get pageTitlePraiseListEdit => 'Editar Lista';

  @override
  String messageWelcome(String username) {
    return 'Bem-vindo, $username!';
  }

  @override
  String get messageNotAuthenticated => 'Não autenticado';

  @override
  String get messageNoTagsAvailable => 'Nenhuma etiqueta disponível';

  @override
  String get messageNoMaterialsAdded => 'Nenhum material adicionado';

  @override
  String get messageNoMaterialKindsAvailable =>
      'Nenhum Categoria do Material disponível';

  @override
  String get messageNoTagsForFilter => 'Nenhuma etiqueta (todos os louvores)';

  @override
  String get messageNoMaterials => 'Nenhum material cadastrado';

  @override
  String get messageNoTranslationsAvailable => 'Nenhuma tradução disponível';

  @override
  String get messageNoLists => 'Nenhuma lista encontrada';

  @override
  String get messageNoListsFound =>
      'Nenhuma lista encontrada com os filtros aplicados';

  @override
  String get messageNoPraisesInList => 'Nenhum louvor nesta lista';

  @override
  String get messageUnknown => 'Desconhecido';

  @override
  String get messageCreatePraiseFirst => 'É necessário criar o louvor primeiro';

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
  String get sectionTags => 'Etiquetas';

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
  String get labelSort => 'Ordem';

  @override
  String get labelSortBy => 'Ordenar por:';

  @override
  String get labelDirection => 'Direção:';

  @override
  String get labelAscending => 'Crescente';

  @override
  String get labelDescending => 'Decrescente';

  @override
  String get labelWithoutNumber => 'Sem número:';

  @override
  String get labelWithoutNumberFirst => 'Por primeiro';

  @override
  String get labelWithoutNumberLast => 'Por último';

  @override
  String get labelWithoutNumberHide => 'Ocultar';

  @override
  String get actionViewOldMaterials => 'Ver Antigos';

  @override
  String get actionHideOldMaterials => 'Ocultar Antigos';

  @override
  String get actionAddTranslation => 'Adicionar Tradução';

  @override
  String get actionNewList => 'Nova Lista';

  @override
  String get actionCreateFirstList => 'Criar primeira lista';

  @override
  String get actionFollow => 'Seguir';

  @override
  String get actionUnfollow => 'Deixar de Seguir';

  @override
  String get actionCopy => 'Copiar';

  @override
  String get actionCopyList => 'Copiar Lista';

  @override
  String get actionAddToList => 'Adicionar à Lista';

  @override
  String get actionRemoveFromList => 'Remover da Lista';

  @override
  String get actionMoveUp => 'Mover para Cima';

  @override
  String get actionMoveDown => 'Mover para Baixo';

  @override
  String get actionClearFilters => 'Limpar Filtros';

  @override
  String get dialogTitleConfirmDelete => 'Confirmar Exclusão';

  @override
  String get dialogTitleStartReview => 'Iniciar Revisão';

  @override
  String get dialogTitleDownloadZip => 'Baixar Louvor em ZIP';

  @override
  String get dialogMessageDeletePraise =>
      'Tem certeza que deseja excluir este louvor? Esta ação não pode ser desfeita.';

  @override
  String get dialogMessageDeleteTag =>
      'Tem certeza que deseja excluir esta etiqueta?';

  @override
  String get dialogMessageDeleteMaterialKind =>
      'Tem certeza que deseja excluir esta categoria do material?';

  @override
  String get dialogMessageDeleteMaterialType =>
      'Tem certeza que deseja excluir este tipo do material?';

  @override
  String get dialogMessageDeleteLanguage =>
      'Tem certeza que deseja excluir esta linguagem?';

  @override
  String get dialogMessageDeleteTranslation =>
      'Tem certeza que deseja excluir esta tradução?';

  @override
  String get dialogMessageDeleteMaterial =>
      'Tem certeza que deseja excluir este material?';

  @override
  String get dialogMessageDeletePraiseList =>
      'Tem certeza que deseja excluir esta lista? Esta ação não pode ser desfeita.';

  @override
  String get dialogMessageRemovePraiseFromList =>
      'Tem certeza que deseja remover este louvor da lista?';

  @override
  String get dialogMessageNoFileMaterials =>
      'Este louvor não possui materiais de arquivo para download';

  @override
  String get dialogLabelReviewDescription => 'Descrição (opcional)';

  @override
  String get errorConnectionFailed =>
      'Não foi possível conectar ao servidor.\nVerifique se o backend está rodando.';

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
    return 'Erro ao carregar o louvor: $error';
  }

  @override
  String errorLoadMaterialKind(String error) {
    return 'Erro ao carregar categoria do material: $error';
  }

  @override
  String errorLoadMaterialType(String error) {
    return 'Erro ao carregar tipo do material: $error';
  }

  @override
  String errorLoadAudio(String error) {
    return 'Erro ao carregar áudio: $error';
  }

  @override
  String get errorLoadPdf => 'Erro ao carregar PDF';

  @override
  String errorCreatePraise(String error) {
    return 'Erro ao criar o louvor: $error';
  }

  @override
  String errorUpdatePraise(String error) {
    return 'Erro ao atualizar o louvor: $error';
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
    return 'Erro ao salvar etiqueta: $error';
  }

  @override
  String errorDeleteTag(String error) {
    return 'Erro ao excluir etiqueta: $error';
  }

  @override
  String errorSaveMaterialKind(String error) {
    return 'Erro ao salvar categoria do material: $error';
  }

  @override
  String errorDeleteMaterialKind(String error) {
    return 'Erro ao excluir categoria do material: $error';
  }

  @override
  String errorSaveMaterialType(String error) {
    return 'Erro ao salvar tipo do material: $error';
  }

  @override
  String errorDeleteMaterialType(String error) {
    return 'Erro ao excluir tipo do material: $error';
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
  String errorDeleteTranslation(String error) {
    return 'Erro ao excluir tradução: $error';
  }

  @override
  String errorSaveTranslation(String error) {
    return 'Erro ao salvar tradução: $error';
  }

  @override
  String errorLoadTranslation(String error) {
    return 'Erro ao carregar tradução: $error';
  }

  @override
  String errorLoadPraiseList(Object error) {
    return 'Erro ao carregar lista: $error';
  }

  @override
  String errorCreatePraiseList(Object error) {
    return 'Erro ao criar lista: $error';
  }

  @override
  String errorUpdatePraiseList(Object error) {
    return 'Erro ao atualizar lista: $error';
  }

  @override
  String errorDeletePraiseList(Object error) {
    return 'Erro ao excluir lista: $error';
  }

  @override
  String errorAddPraiseToList(Object error) {
    return 'Erro ao adicionar louvor à lista: $error';
  }

  @override
  String errorRemovePraiseFromList(Object error) {
    return 'Erro ao remover louvor da lista: $error';
  }

  @override
  String errorFollowList(Object error) {
    return 'Erro ao seguir lista: $error';
  }

  @override
  String errorUnfollowList(Object error) {
    return 'Erro ao deixar de seguir lista: $error';
  }

  @override
  String errorCopyList(Object error) {
    return 'Erro ao copiar lista: $error';
  }

  @override
  String get errorNeedCreatePraiseFirst =>
      'É necessário criar o louvor primeiro';

  @override
  String get errorDownloadCanceled => 'Download cancelado';

  @override
  String get successRegister => 'Registro realizado com sucesso! Faça login.';

  @override
  String get successPraiseCreated =>
      'Louvor criado com sucesso. Você pode adicionar materiais na página de edição.';

  @override
  String get successPraiseUpdated => 'Louvor atualizado com sucesso';

  @override
  String get successPraiseDeleted => 'Louvor excluído com sucesso';

  @override
  String get successReviewStarted => 'Revisão iniciada com sucesso';

  @override
  String get successReviewCanceled => 'Revisão cancelada com sucesso';

  @override
  String get successReviewFinished => 'Revisão finalizada com sucesso';

  @override
  String get successMaterialDeleted => 'Material excluído com sucesso';

  @override
  String get successTagSaved => 'Etiqueta salva com sucesso';

  @override
  String get successTagDeleted => 'Etiqueta excluída com sucesso';

  @override
  String get successMaterialKindSaved =>
      'categoria do material salvo com sucesso';

  @override
  String get successMaterialKindDeleted =>
      'categoria do material excluído com sucesso';

  @override
  String get successMaterialTypeSaved => 'Tipo do Material salvo com sucesso';

  @override
  String get successMaterialTypeDeleted =>
      'Tipo do Material excluído com sucesso';

  @override
  String get successLanguageSaved => 'Linguagem salva com sucesso';

  @override
  String get successLanguageDeleted => 'Linguagem excluída com sucesso';

  @override
  String get successTranslationSaved => 'Tradução salva com sucesso';

  @override
  String get successTranslationDeleted => 'Tradução excluída com sucesso';

  @override
  String get successPraiseListCreated => 'Lista criada com sucesso';

  @override
  String get successPraiseListUpdated => 'Lista atualizada com sucesso';

  @override
  String get successPraiseListDeleted => 'Lista excluída com sucesso';

  @override
  String get successPraiseAddedToList =>
      'Louvor adicionado à lista com sucesso';

  @override
  String get successPraiseRemovedFromList =>
      'Louvor removido da lista com sucesso';

  @override
  String get successListFollowed => 'Lista seguida com sucesso';

  @override
  String get successListUnfollowed => 'Deixou de seguir a lista com sucesso';

  @override
  String get successListCopied => 'Lista copiada com sucesso';

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
  String get drawerPraises => 'Louvores';

  @override
  String get drawerTags => 'Etiquetas';

  @override
  String get drawerLanguages => 'Linguagens';

  @override
  String get drawerLanguage => 'Idioma';

  @override
  String get drawerMaterialKinds => 'Categorias do Material';

  @override
  String get drawerMaterialTypes => 'Tipos do Material';

  @override
  String get drawerTranslations => 'Traduções';

  @override
  String get drawerPraiseLists => 'Listas de Louvores';

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
  String get cardPraises => 'Louvores';

  @override
  String get cardTags => 'Etiquetas';

  @override
  String get cardMaterialKinds => 'Categorias do Material';

  @override
  String get cardLists => 'Listas';

  @override
  String labelPraisesCount(int count) {
    return '$count louvor(es)';
  }

  @override
  String get labelBy => 'por';
}
