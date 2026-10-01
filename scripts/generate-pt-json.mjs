import fs from 'fs'
import path from 'path'

const en = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages/en.json'), 'utf8'))
const es = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages/es.json'), 'utf8'))

const pt = {
  "home": {
    "brandName": "ChurchCore LMS",
    "subtitle": "Uma plataforma de aprendizagem rápida, segura e pronta para o ministério.",
    "projectHqLink": "QG do Projeto"
  },
  "auth": {
    "login": {
      "heading": "Entrar",
      "brandSubtitle": "ChurchCore LMS",
      "emailLabel": "E-mail",
      "submitLoading": "Entrando…",
      "submitButton": "Entrar",
      "newChurch": "Nova igreja?",
      "startTrial": "Comece um teste gratuito",
      "forgot": "Esqueceu a senha?",
      "errors": {
        "invalid_credentials": "E-mail ou senha incorretos.",
        "too_many": "Muitas tentativas de login. Tente novamente em {minutes} minutos.",
        "captcha": "Falha na verificação de segurança. Tente novamente.",
        "invalid_input": "Digite seu e-mail e senha.",
        "generic": "Falha ao entrar. Tente novamente."
      }
    },
    "sso": {
      "google": "Continuar com o Google",
      "microsoft": "Continuar com a Microsoft",
      "or": "ou use seu e-mail",
      "redirecting": "Redirecionando…",
      "error": "Não foi possível iniciar o login. Tente novamente.",
      "errors": {
        "sso_required": "Sua igreja exige que a equipe faça login com Google ou Microsoft.",
        "domain_not_allowed": "Sua igreja só permite login com seus próprios endereços de e-mail.",
        "password_disabled": "Sua igreja desativou o login por senha. Use Google ou Microsoft.",
        "auth_callback_failed": "O login não foi concluído. Tente novamente."
      }
    },
    "forgot": {
      "heading": "Redefinir sua senha",
      "intro": "Digite o e-mail com o qual você faz login. Se houver uma conta associada, enviaremos um link para escolher uma nova senha.",
      "submit": "Enviar link de redefinição por e-mail",
      "submitting": "Enviando…",
      "sent": "Se uma conta usar esse e-mail, enviamos um link para redefinir a senha. Verifique sua caixa de entrada.",
      "back": "Voltar para o login",
      "errors": {
        "unavailable": "A redefinição de senha por e-mail ainda não está disponível neste site. Peça ajuda ao administrador da sua igreja.",
        "too_many": "Muitas solicitações. Tente novamente mais tarde.",
        "invalid_email": "Digite um endereço de e-mail válido.",
        "captcha": "Falha na verificação de segurança. Tente novamente.",
        "invalid_link": "Esse link de redefinição é inválido ou expirou. Solicite um novo.",
        "generic": "Algo deu errado. Tente novamente."
      }
    },
    "password": {
      "heading": "Definir sua senha",
      "changeHeading": "Alterar sua senha",
      "resetIntro": "Escolha uma nova senha para sua conta.",
      "intro": "Use pelo menos 8 caracteres. Evite senhas comuns.",
      "current": "Senha atual",
      "new": "Nova senha",
      "confirm": "Confirmar nova senha",
      "submit": "Salvar senha",
      "saving": "Salvando…",
      "saved": "Senha salva. Outros dispositivos foram desconectados.",
      "mismatch": "As senhas não coincidem.",
      "errors": {
        "too_short": "Use pelo menos 8 caracteres.",
        "too_long": "Use no máximo 72 caracteres.",
        "matches_email": "Não use seu endereço de e-mail como senha.",
        "too_common": "Essa senha é muito comum. Escolha algo mais difícil de adivinhar.",
        "wrong_current": "Sua senha atual está incorreta.",
        "current_required": "Digite sua senha atual.",
        "not_signed_in": "Sua sessão expirou. Faça login novamente.",
        "same": "Escolha uma senha diferente da sua atual.",
        "generic": "Não foi possível salvar sua senha. Tente novamente.",
        "too_many": "Muitas tentativas. Tente novamente mais tarde."
      },
      "welcomeIntro": "Bem-vindo! Escolha uma senha para poder fazer login novamente mais tarde. Use pelo menos 8 caracteres.",
      "continue": "Continuar para o seu painel"
    }
  },
  "common": {
    "signIn": "Entrar",
    "signOut": "Sair",
    "password": "Senha",
    "emailPlaceholder": "voce@exemplo.com",
    "loading": "Carregando…",
    "save": "Salvar",
    "cancel": "Cancelar",
    "delete": "Excluir",
    "edit": "Editar",
    "yes": "Sim",
    "no": "Não",
    "published": "Publicado",
    "draft": "Rascunho",
    "updated": "Atualizado",
    "notAvailable": "Não disponível",
    "notGraded": "Não avaliado",
    "studentFallback": "Aluno",
    "optionalHint": "(opcional)",
    "submittingButton": "Enviando…",
    "savingButton": "Salvando…",
    "timeAgoJustNow": "agora mesmo",
    "unreadCountTemplate": "{n} não lidas",
    "browseCoursesArrowLink": "Explorar cursos →",
    "additionalMaterialsHeading": "Materiais Adicionais",
    "instructorCardUnavailable": "Cartão do instrutor não disponível.",
    "levelLabel": "Nível",
    "expandSidebarTooltip": "Expandir barra lateral",
    "collapseSidebarTooltip": "Recolher barra lateral",
    "viewAsChart": "Ver como gráfico",
    "viewAsTable": "Ver como tabela",
    "tryAgainButton": "Tentar novamente",
    "searchButton": "Buscar"
  },
  "status": {
    "completed": "Concluído",
    "inProgress": "Em andamento",
    "enrolled": "Inscrito",
    "dropped": "Cancelado"
  },
  "nav": {
    "logoAlt": "ChurchCore LMS",
    "profileFallback": "Perfil",
    "dashboard": "Painel",
    "courses": "Cursos",
    "paths": "Trilhas de Aprendizagem",
    "grades": "Notas",
    "reports": "Relatórios",
    "certificates": "Certificados",
    "leaderboard": "Classificação",
    "messages": "Mensagens",
    "announcements": "Comunicados",
    "calendar": "Calendário",
    "myGroups": "Meus Grupos",
    "guardianPortal": "Portal do Responsável",
    "hq": "QG",
    "mobile": {
      "home": "Início"
    },
    "sectionDivider": {
      "guardian": "Responsável",
      "staff": "Equipe",
      "admin": "Administração",
      "platform": "Plataforma"
    },
    "adminDrawer": {
      "triggerButton": "Administração",
      "openAriaLabel": "Abrir navegação de administração",
      "closeAriaLabel": "Fechar navegação de administração",
      "panelHeading": "Administração"
    },
    "admin": {
      "users": "Usuários",
      "cohorts": "Turmas",
      "sections": "Seções",
      "terms": "Períodos Letivos",
      "programTracks": "Trilhas de Programa",
      "paths": "Trilhas de Aprendizagem",
      "blueprints": "Matrizes Curriculares",
      "aiAnalytics": "Análises de IA",
      "billing": "Faturamento",
      "systemHealth": "Saúde do Sistema",
      "oneRoster": "OneRoster",
      "orgSettings": "Configurações da Organização"
    },
    "platformAdmin": "Administração da Plataforma"
  },
  "notificationBell": {
    "bellAriaLabelTemplate": "Notificações ({n} não lidas)",
    "sidebarLabel": "Notificações",
    "panelHeading": "Notificações",
    "markAllReadButton": "Marcar todas como lidas",
    "emptyState": "Nenhuma notificação ainda.",
    "seeAllLink": "Ver todas as notificações →",
    "connectingStatus": "Conectando…",
    "reconnectingStatus": "Reconectando…"
  },
  "globalSearch": {
    "openSearchAriaLabel": "Abrir busca",
    "inputPlaceholder": "Buscar cursos, comunicados, pessoas…",
    "minCharsHint": "Digite pelo menos 2 caracteres para buscar",
    "noResultsTemplate": "Nenhum resultado para \"{query}\"",
    "coursesSectionLabel": "Cursos",
    "announcementsSectionLabel": "Comunicados",
    "peopleSectionLabel": "Pessoas",
    "hintNavigate": "navegar",
    "hintOpen": "abrir",
    "hintClose": "fechar"
  },
  "offlineBanner": {
    "statusMessage": "Você está offline — recursos interativos (envios, questionários) estão desativados."
  },
  "dashboard": {
    "student": {
      "emptyEnrollments": "Você ainda não se inscreveu em nenhum curso.",
      "browseCoursesButton": "Explorar cursos",
      "inProgressSection": "Em Andamento",
      "comingUpSection": "A Seguir",
      "noCoursesStartedEmpty": "Nenhum curso iniciado ainda.",
      "pausedSection": "Pausados"
    }
  },
  "courses": {
    "list": {
      "headingTeacher": "Meus Cursos",
      "headingStaff": "Todos os Cursos",
      "headingStudent": "Catálogo de Cursos",
      "subtitleTeacher": "Cursos de sua propriedade. Publique quando estiver pronto para os alunos.",
      "subtitleStaff": "Todos os cursos na plataforma.",
      "subtitleFilteredTemplate": "Mostrando {n, plural, one {# curso} other {# cursos}} nesta trilha",
      "subtitleAvailableTemplate": "{n, plural, one {# curso disponível} other {# cursos disponíveis}}",
      "newCourseButton": "+ Novo Curso",
      "allTracksFilter": "Todas as Trilhas",
      "backToTracksLink": "← Todas as trilhas",
      "editAction": "Editar",
      "buildAction": "Estruturar",
      "analyticsAction": "Análises",
      "gradesAction": "Notas",
      "emptyTrack": "Nenhum curso nesta trilha.",
      "emptyGeneric": "Nenhum curso ainda.",
      "emptyStudent": "Nenhum curso disponível ainda.",
      "emptyCreateCta": "Crie seu primeiro curso"
    },
    "detail": {
      "notFoundHeading": "Curso Não Encontrado",
      "notFoundMessage": "Verifique o link ou entre em contato com o administrador.",
      "notFoundBackLink": "← Voltar aos cursos",
      "coursescrumb": "Cursos",
      "statusPublished": "Publicado",
      "statusDraft": "Rascunho",
      "lessonCountTemplate": "{publishedCount, plural, one {# aula} other {# aulas}}",
      "xpAvailableTemplate": "{totalXp} XP disponíveis",
      "moduleCountTemplate": "{count, plural, one {# módulo} other {# módulos}}",
      "materialsCountTemplate": "{materialsCount, plural, one {# material adicional} other {# materiais adicionais}}",
      "levelRequiredBadge": "Nível {level}+ necessário",
      "requiresLabel": "Requer:",
      "ageRangeTemplate": "Idades {min}–{max}",
      "ageRangeMinTemplate": "A partir de {min} anos",
      "ageRangeMaxTemplate": "Até {max} anos",
      "ctaReview": "Revisar Curso",
      "ctaContinue": "Continuar Aprendendo",
      "ctaStart": "Iniciar Aprendizado",
      "progressBarLabel": "Progresso",
      "materialsLink": "Materiais Adicionais ({materialsCount})",
      "inviteOnlyNotice": "Inscrição apenas por convite",
      "cohortRequiredNotice": "Inscrição por turma necessária",
      "loginToEnrollButton": "Faça login para se inscrever",
      "curriculumHeading": "Currículo",
      "emptyCurriculum": "Nenhum conteúdo publicado ainda.",
      "moduleItemCountTemplate": "{count, plural, one {# item} other {# itens}}",
      "emptyModule": "Nenhuma aula ainda.",
      "lockedTooltip": "Bloqueado"
    },
    "materials": {
      "breadcrumbCurrent": "Materiais Adicionais",
      "backLink": "← Voltar para Materiais Adicionais",
      "heading": "Materiais Adicionais",
      "subheading": "Leituras e páginas de referência complementares do seu instrutor.",
      "emptyHeading": "Nenhum material disponível",
      "emptyDescription": "Seu instrutor ainda não publicou materiais adicionais para este curso.",
      "publishedPrefix": "Publicado",
      "updatedPrefix": "Atualizado",
      "contentTypeTag": "Material Adicional",
      "emptyBody": "Sem conteúdo."
    },
    "complete": {
      "heading": "Curso Concluído!",
      "finishedPrefix": "Você concluiu",
      "certificateHeader": "Certificado de Conclusão",
      "certifiesText": "Certificamos que",
      "hasCompletedText": "concluiu com êxito o curso",
      "finalGradeLabel": "Nota Final",
      "xpEarnedLabel": "XP Ganho",
      "completionStatLabel": "Conclusão",
      "currentStandingLabel": "Sua posição atual",
      "levelBadgeTemplate": "Nível {level} · {xp} XP total",
      "leaderboardLink": "Classificação →",
      "viewCertificatesButton": "Ver todos os certificados",
      "browseMoreCoursesButton": "Explorar mais cursos →",
      "viewPerformanceLink": "Ver desempenho acadêmico completo →"
    }
  },
  "messages": {
    "newMessage": {
      "triggerButton": "+ Nova Mensagem",
      "dialogHeading": "Nova Mensagem",
      "toLabel": "Para",
      "searchPlaceholder": "Buscar por nome ou e-mail…",
      "messageLabel": "Mensagem",
      "messagePlaceholder": "Escreva sua mensagem…",
      "sendingButton": "Enviando…",
      "sendButton": "Enviar"
    },
    "list": {
      "heading": "Mensagens",
      "unreadSubtitleTemplate": "{n, plural, one {# conversa não lida} other {# conversas não lidas}}",
      "emptyState": "Nenhuma conversa ainda.",
      "threadPreviewEmpty": "Nenhuma mensagem ainda"
    },
    "thread": {
      "titleFallback": "Conversa",
      "emptyState": "Nenhuma mensagem ainda. Diga olá!",
      "deletedPlaceholder": "Mensagem excluída",
      "composerPlaceholder": "Escreva uma mensagem… (Ctrl+Enter para enviar)",
      "composerHint": "Ctrl+Enter para enviar",
      "deleteAriaLabel": "Excluir mensagem"
    },
    "aboutStudent": {
      "to": "Mensagem para {name}",
      "send": "Enviar",
      "sending": "Enviando…",
      "cancel": "Cancelar",
      "error": "Não foi possível enviar a mensagem. Tente novamente.",
      "messageTeacher": "Enviar mensagem para {name}",
      "messageGuardian": "Enviar mensagem ao responsável {name}",
      "threadAbout": "Sobre {name}"
    }
  },
  "calendar": {
    "view": {
      "selectDayPlaceholder": "Selecione um dia",
      "addButton": "Adicionar",
      "noEventsOnDay": "Nenhum evento neste dia.",
      "allDay": "Dia inteiro",
      "upcomingThisMonth": "Próximos Este Mês",
      "moreEventsTemplate": "+ mais {n}"
    },
    "list": {
      "heading": "Calendário",
      "subtitle": "Sua programação em visão geral.",
      "addEventButton": "+ Adicionar Evento"
    },
    "new": {
      "heading": "Novo Evento no Calendário",
      "breadcrumbParent": "Calendário",
      "breadcrumbCurrent": "Novo Evento",
      "titleLabel": "Título",
      "titlePlaceholder": "ex.: Encontro da turma de formação",
      "startsLabel": "Início",
      "endsLabel": "Fim",
      "scopeLabel": "Escopo",
      "scopePersonal": "Pessoal",
      "scopeCourse": "Curso",
      "typeLabel": "Tipo",
      "typeCustom": "Personalizado",
      "typeAssignmentDue": "Entrega de tarefa",
      "typeCourseStart": "Início do curso",
      "typeCourseEnd": "Término do curso",
      "typeExam": "Avaliação",
      "typeOfficeHours": "Plantão de dúvidas",
      "typeHoliday": "Feriado",
      "typeInstitutional": "Institucional",
      "courseFieldLabel": "Curso",
      "selectCoursePlaceholder": "Selecionar curso",
      "locationLabel": "Localização",
      "locationPlaceholder": "Sala, campus ou link remoto",
      "colorLabel": "Cor",
      "descriptionLabel": "Descrição",
      "descriptionPlaceholder": "Anotações opcionais para alunos ou equipe.",
      "createEventButton": "Criar Evento"
    }
  },
  "announcements": {
    "heading": "Comunicados",
    "newButton": "+ Publicar Comunicado",
    "draftsHeading": "Seus Rascunhos",
    "draftMetaTemplate": "Rascunho · {scope}",
    "publishAction": "Publicar",
    "scheduledHeading": "Agendados",
    "publishesDateTemplate": "Será publicado em {date}",
    "emptyState": "Nenhum comunicado ainda.",
    "postedByTemplate": "Publicado por {authorName}",
    "priority": {
      "urgent": "Urgente",
      "high": "Alta",
      "normal": "Normal",
      "low": "Baixa"
    }
  },
  "certificates": {
    "heading": "Meus Certificados",
    "subtitleCertTemplate": "{n, plural, one {# certificado obtido} other {# certificados obtidos}}",
    "subtitleDiplomaTemplate": "{n, plural, one {# diploma obtido} other {# diplomas obtidos}}",
    "performanceLink": "Desempenho acadêmico →",
    "emptyState": "Nenhum certificado ainda.",
    "browseCoursesLink": "Explorar cursos →",
    "cardKicker": "Certificado",
    "xpEarnedLabel": "XP ganho",
    "viewLink": "Ver →",
    "downloadPdfButton": "Baixar PDF",
    "programDiplomasHeading": "Diplomas de Programa",
    "programDiplomaKicker": "Diploma de Programa",
    "diplomaIconAlt": "chapéu de formatura"
  },
  "leaderboard": {
    "heading": "Classificação",
    "subtitle": "Alunos com mais XP acumulado",
    "yourStandingLabel": "Sua posição",
    "levelXpTemplate": "Nível {level} · {xp} XP",
    "myGradesLink": "Minhas notas →",
    "anonymousFallback": "Anônimo",
    "emptyState": "Nenhum aluno acumulou XP ainda.",
    "youSuffix": " (você)"
  },
  "notifications": {
    "heading": "Notificações",
    "backToDashboardLink": "← Painel",
    "filterAll": "Todas",
    "filterUnread": "Não lidas",
    "markAllRead": "Marcar todas como lidas",
    "caughtUpEmpty": "Você está em dia — nenhuma notificação.",
    "noUnreadEmpty": "Nenhuma notificação não lida.",
    "dismissAriaLabel": "Dispensar notificação",
    "timeAgoMinutes": "há {n}m",
    "timeAgoHours": "há {n}h",
    "timeAgoDays": "há {n}d"
  },
  "guardian": {
    "list": {
      "heading": "Portal do Responsável",
      "subtitle": "Visualização somente leitura dos alunos sob seus cuidados.",
      "loadError": "Falha ao carregar alunos. Atualize a página.",
      "emptyHeading": "Nenhum aluno vinculado ainda",
      "emptyDescription": "Peça a um membro da equipe ou administrador para vincular você à conta do seu filho.",
      "coursesStat": "Cursos",
      "doneStat": "Concluídos",
      "viewProgressLink": "Ver progresso →"
    },
    "detail": {
      "coursesSectionHeadingTemplate": "Cursos ({n})",
      "xpStatLabel": "XP",
      "emptyEnrollments": "Não matriculado em nenhum curso ainda.",
      "progressBarLabel": "Progresso",
      "recentGradesHeading": "Notas Recentes",
      "emptyGrades": "Nenhum trabalho avaliado ainda.",
      "certificatesSectionHeadingTemplate": "Certificados ({n})"
    }
  },
  "reports": {
    "fallback": {
      "heading": "Relatórios não disponíveis",
      "description": "Sua função de conta não possui uma visualização de relatórios atribuída. Entre em contato com o administrador."
    },
    "student": {
      "emptyHeading": "Nenhum dado de relatório ainda",
      "emptyDescription": "Inscreva-se em um curso ou conclua sua primeira atividade para preencher os relatórios de progresso.",
      "heading": "Meus Relatórios de Progresso",
      "lastUpdatedTemplate": "Última atualização em {date}",
      "exportPdfButton": "Exportar PDF",
      "exportXlsxButton": "Exportar XLSX",
      "noscriptFallback": "O JavaScript está desativado. Use a visualização em tabela abaixo para seu relatório de progresso acessível.",
      "moduleCompletionHeading": "Conclusão de Módulos",
      "gradeHistoryHeading": "Histórico de Notas",
      "courseEnrollmentsHeading": "Matrículas em Cursos"
    },
    "export": {
      "preparingStatus": "Preparando...",
      "processingStatus": "Processando... verifique Seus Relatórios",
      "readyStatus": "Pronto",
      "generationFailedError": "Falha na geração do relatório",
      "exportFailedError": "Falha na exportação do relatório",
      "readyToastTitle": "Relatório pronto",
      "readyToastDescription": "Abra Seus Relatórios para baixá-lo.",
      "failedToastTitle": "Falha no relatório",
      "processingToastTitle": "O relatório está sendo processado",
      "processingToastDescription": "Ele aparecerá em Seus Relatórios.",
      "downloadedToastTitle": "Relatório baixado",
      "catchToastTitle": "Falha na exportação"
    },
    "tables": {
      "enrollment": {
        "emptyState": "Nenhuma matrícula encontrada",
        "caption": "Relatório de matrícula do aluno em cursos",
        "enrolledDateLabel": "Data de Matrícula",
        "statusLabel": "Status",
        "avgGradeLabel": "Nota Média",
        "certificateLabel": "Certificado",
        "courseNameHeader": "Nome do Curso",
        "completionStatusHeader": "Status de Conclusão"
      }
    },
    "charts": {
      "gradeHistory": {
        "emptyFallback": "Nenhuma tarefa avaliada disponível",
        "ariaSummaryTemplate": "{n, plural, one {# item avaliado} other {# itens avaliados}} com nota média de {avg} por cento",
        "containerAriaLabelTemplate": "Histórico de notas: {summary}",
        "assignmentHeader": "Tarefa",
        "gradeHeader": "Nota",
        "submittedHeader": "Enviado"
      },
      "moduleCompletion": {
        "emptyFallback": "Nenhum dado de conclusão de módulo disponível",
        "ariaSummaryTemplate": "{completed} de {total} módulos concluídos no ponto de relatório mais recente",
        "containerAriaLabelTemplate": "Conclusão de módulos ao longo do tempo: {summary}",
        "dateHeader": "Data",
        "completedHeader": "Concluídos",
        "totalHeader": "Total",
        "completedSeriesName": "Concluídos",
        "totalSeriesName": "Total"
      }
    }
  },
  "myGroups": {
    "list": {
      "heading": "Meus Grupos",
      "subtitle": "Seus grupos de seção e fóruns de discussão.",
      "emptyState": "Você ainda não foi atribuído a nenhum grupo.",
      "emptyDescription": "Seu instrutor adicionará você quando o trabalho em grupo começar.",
      "leaderBadge": "Líder",
      "memberCountTemplate": "{n, plural, one {# membro} other {# membros}}"
    },
    "detail": {
      "roleNoticeTemplate": "Você é um {role} deste grupo"
    },
    "discussion": {
      "heading": "Discussões",
      "emptyThreads": "Nenhum tópico ainda.",
      "selectThreadPlaceholder": "Selecione um tópico para ler",
      "lockedThreadNotice": "Este tópico está bloqueado — novas respostas estão desativadas.",
      "emptyPosts": "Nenhuma postagem ainda. Seja o primeiro!",
      "ownPostAuthorLabel": "Você",
      "cancelToggleButton": "✕ Cancelar",
      "newThreadButton": "+ Novo Tópico",
      "startButton": "Iniciar",
      "threadTitlePlaceholder": "Título do tópico…",
      "replyPlaceholder": "Escreva uma resposta… (⌘↵ para enviar)"
    }
  },
  "onboarding": {
    "heading": "Organização não configurada",
    "description": "Sua conta ainda não está vinculada a uma organização. Isso é necessário para acessar relatórios e outros recursos da organização.",
    "adminFixLabel": "Administrador: corrigir via editor SQL",
    "orRerunFragment": "Ou execute novamente",
    "regenerateDataFragment": "para gerar novamente todos os dados de demonstração com os vínculos da organização corretos."
  },
  "performance": {
    "heading": "Desempenho Acadêmico",
    "subtitle": "Suas notas, progresso e situação em todos os cursos matriculados.",
    "gpaLabel": "Média Geral (GPA)",
    "enrolledCoursesLabel": "Cursos Matriculados",
    "atRiskLabel": "Em Risco",
    "totalXpLabel": "Total de XP Ganho",
    "xpSublabel": "Em todos os cursos",
    "atRiskAlertTemplate": "⚠ {n, plural, one {# curso está} other {# cursos estão}} sinalizado(s) em risco. Entre em contato com seu instrutor ou entregue os trabalhos pendentes.",
    "emptyState": "Nenhum dado de matrícula ainda.",
    "table": {
      "courseHeader": "Curso",
      "statusHeader": "Status",
      "progressHeader": "Progresso",
      "avgGradeHeader": "Nota Média",
      "gpaHeader": "GPA",
      "submissionsHeader": "Envios"
    }
  },
  "profile": {
    "page": {
      "heading": "Seu Perfil",
      "subtitle": "Como você aparece no ChurchCore LMS.",
      "setNameFallback": "Defina seu nome abaixo"
    },
    "form": {
      "roleAdministrator": "Administrador",
      "roleManager": "Gerente",
      "roleTeacher": "Professor",
      "roleStudent": "Aluno",
      "displayNameLabel": "Nome de Exibição",
      "avatarUrlLabel": "URL do Avatar",
      "avatarUrlHint": "(opcional — cole o link de qualquer imagem)",
      "previewCaption": "Pré-visualização",
      "dobLabel": "Data de Nascimento",
      "dobHint": "(opcional — usado para cursos com restrição de idade)",
      "roleFieldLabel": "Função",
      "roleManagedHint": "Gerenciado por administradores",
      "fullNamePlaceholder": "Seu nome completo",
      "avatarUrlPlaceholder": "https://exemplo.com/avatar.jpg",
      "avatarPreviewAlt": "Pré-visualização do avatar",
      "saveButton": "Salvar Perfil",
      "displayNameRequiredError": "O nome de exibição é obrigatório.",
      "saveSuccessNotice": "Perfil salvo com sucesso.",
      "emailDigestLabel": "E-mail de progresso semanal",
      "emailDigestHint": "Um breve resumo de seus cursos todas as segundas-feiras.",
      "saveError": "Não foi possível salvar seu perfil. Tente novamente."
    }
  },
  "offline": {
    "pageTitle": "Offline — ChurchCore LMS",
    "heading": "Você está offline",
    "description": "Este conteúdo não está disponível sem uma conexão com a internet. Visite esta página online para lê-la offline da próxima vez.",
    "reconnectDescription": "Assim que você se reconectar, poderá retornar aos seus cursos e todo o seu progresso estará intacto.",
    "dashboardButton": "Ir para o painel"
  },
  "join": {
    "page": {
      "headingTemplate": "Junte-se a {name}",
      "subtitle": "Crie sua conta para acessar cursos e materiais de aprendizagem."
    },
    "form": {
      "fullNameLabel": "Nome completo",
      "namePlaceholder": "Seu nome",
      "emailLabel": "Endereço de e-mail",
      "emailPlaceholder": "voce@exemplo.com",
      "passwordLabel": "Senha",
      "passwordPlaceholder": "Pelo menos 8 caracteres",
      "turnstileMissingError": "Por favor, conclua a verificação de segurança.",
      "turnstileFailedError": "Falha na verificação de segurança. Atualize e tente novamente.",
      "accountCreatedNotice": "Conta criada — faça login.",
      "submitLoading": "Criando conta…",
      "submitButtonTemplate": "Junte-se a {orgName}",
      "alreadyHaveAccountText": "Já tem uma conta?",
      "signInLink": "Entrar"
    }
  },
  "learning": {
    "teacherPlug": {
      "yourInstructorLabel": "Seu Instrutor",
      "notFoundError": "Instrutor não encontrado"
    },
    "block": {
      "emptyPageBody": "Nenhum conteúdo ainda.",
      "noVideoUrl": "Nenhuma URL de vídeo configurada.",
      "fileUnavailable": "Arquivo não disponível.",
      "downloadFileFallback": "Baixar arquivo",
      "noUrlConfigured": "Nenhuma URL configurada.",
      "dueLabel": "Prazo:",
      "quizEmpty": "Nenhuma pergunta configurada para este questionário.",
      "questionCountTemplate": "{count, plural, one {# pergunta} other {# perguntas}}",
      "pointsTotalTemplate": "{n} pontos no total",
      "noMeetingUrl": "URL de reunião não configurada.",
      "unsupportedType": "Tipo de bloco não suportado.",
      "downloadButton": "Baixar →"
    },
    "assignment": {
      "submittedBanner": "✓ Enviado — aguardando avaliação do instrutor",
      "attachedFileFallback": "Arquivo anexado",
      "gradeLabel": "Nota:",
      "responseFieldLabel": "Sua Resposta",
      "responsePlaceholder": "Escreva sua resposta aqui…",
      "charCountHelperTemplate": "{n} caracteres · Pontuação máxima: {maxPoints}",
      "uploadFileTypeLabel": "Enviar Arquivo",
      "attachmentTypeLabel": "Anexo",
      "dropzoneLabel": "Enviar um arquivo",
      "dropzoneHint": "PDF, Word, imagem — máx. 10 MB",
      "removeFileButton": "Remover",
      "submitButton": "Enviar Tarefa",
      "fileTooLargeError": "O arquivo excede o limite de 10 MB",
      "notAuthenticatedError": "Não autenticado",
      "uploadFailedPrefix": "Falha no envio:",
      "signedUrlError": "O envio foi concluído, mas o link do arquivo não pôde ser gerado. Tente novamente.",
      "alreadyEnrolledError": "Você já está inscrito."
    },
    "attendance": {
      "blockTitle": "Presença",
      "statusPresent": "Presente",
      "statusLate": "Atrasado",
      "statusAbsent": "Ausente",
      "statusExcused": "Justificado",
      "pointsPossibleTemplate": "{points, plural, one {# ponto possível} other {# pontos possíveis}}",
      "recordingBadge": "Registrando…",
      "unmarkedBadge": "Não marcado",
      "manualNotice": "Seu professor registrará sua presença nesta sessão.",
      "autoConfirmation": "Sua presença foi registrada automaticamente ao abrir este bloco."
    },
    "discussion": {
      "scoreLabel": "Pontuação",
      "maxScoreLabel": "/ Máx",
      "promptEyebrow": "Tema da Discussão",
      "replyCountTemplate": "{n, plural, one {# resposta} other {# respostas}}",
      "ownReplyBadge": "✓ Você respondeu",
      "emptyReplies": "Seja o primeiro a responder.",
      "youMarker": "(você)",
      "editedMarker": "editado",
      "ownGradeDisplay": "Nota: {score} / {max}",
      "alreadyPostedNotice": "Você já respondeu — use Editar acima para atualizar sua postagem.",
      "editPlaceholder": "Edite sua resposta…",
      "replyPlaceholder": "Compartilhe suas reflexões…",
      "deleteConfirm": "Excluir sua resposta? Esta ação não pode ser desfeita.",
      "saveGradeButton": "Salvar Nota",
      "gradedEditLink": "Avaliado: {score}/{max} — Editar",
      "gradeActionButton": "Avaliar",
      "postingButton": "Publicando…",
      "postReplyButton": "Publicar resposta",
      "postError": "Não foi possível publicar sua resposta. Tente novamente.",
      "updateError": "Não foi possível atualizar sua resposta. Tente novamente."
    },
    "shell": {
      "progressLabel": "Progresso",
      "pageEyebrowLabel": "Página",
      "welcomeTemplate": "Bem-vindo ao {courseTitle}",
      "noContentPlaceholder": "Nenhum conteúdo publicado ainda.",
      "selectLessonPlaceholder": "Selecione uma aula na barra lateral para começar.",
      "backToCourseLink": "Voltar ao curso",
      "completeCourseButton": "Concluir curso 🎓",
      "previousAriaLabel": "Anterior: {title}",
      "nextAriaLabel": "Próxima: {title}"
    },
    "liveSession": {
      "providerZoom": "Zoom",
      "providerGoogleMeet": "Google Meet",
      "providerTeams": "Microsoft Teams",
      "providerYouTube": "YouTube Live",
      "providerDefault": "Sessão ao Vivo",
      "liveBadge": "AO VIVO",
      "startingInLabel": "Iniciando em",
      "endedNotice": "Esta sessão foi encerrada.",
      "joinNowButton": "🔴 Participar Agora",
      "joinTemplate": "Participar no {label}",
      "opensBeforeButton": "Abre 15 min antes do início",
      "viewRecordingButton": "🎬 Ver Gravação"
    },
    "quiz": {
      "preparingLoading": "Preparando questionário…",
      "pointsTemplate": "{n, plural, one {# pt} other {# pts}}",
      "questionGroupAriaLabel": "Pergunta {n}",
      "matchForTitle": "Correspondência para: {left}",
      "blankInputAriaLabel": "Espaço em branco {blankN} para pergunta {questionN}",
      "noAttemptsHeading": "Nenhuma tentativa restante",
      "attemptsExhaustedDescription": "Este questionário permite {n, plural, one {# tentativa} other {# tentativas}}. Você usou todas elas.",
      "feedbackExcellent": "Excelente trabalho!",
      "feedbackGood": "Bom trabalho — continue assim!",
      "feedbackNeedsWork": "Continue estudando e tente novamente.",
      "noAnswerFallback": "Sem resposta",
      "correctAnswerTemplate": "Correto: {right}",
      "blankResultLabelTemplate": "Espaço {n}:",
      "acceptedAnswersTemplate": "Aceitas: {answers}",
      "attemptCounterTemplate": "Tentativa {n} de {m}",
      "passingScoreTemplate": "Nota de aprovação: {pct}%",
      "timeRemainingTemplate": "{time} restante",
      "selectPlaceholder": "— Selecione —",
      "blankInputPlaceholderTemplate": "Espaço {n}",
      "submitButtonTemplate": "Enviar Questionário ({n}/{m} respondidas)"
    },
    "video": {
      "watchRequiredNotice": "Visualização obrigatória para marcar como concluído",
      "watchedBadge": "Assistido",
      "markWatchedButton": "✓ Marcar como Assistido"
    },
    "moduleItem": {
      "viewRequiredBadge": "Visualização Obrigatória",
      "minGradeBadgeTemplate": "Nota Mínima: {pct}%"
    },
    "enroll": {
      "lockedButton": "🔒 Inscrição Bloqueada",
      "loadingButton": "Inscrevendo…",
      "ctaButton": "Inscreva-se Agora — É Gratuito",
      "alreadyEnrolledError": "Você já está inscrito.",
      "ariaLabel": "Inscrever-se neste curso"
    },
    "activities": {
      "surveyIntroAnonymous": "Suas respostas são anônimas: seu professor verá os resultados sem nomes.",
      "surveyIntroNamed": "Seu professor verá seu nome junto com suas respostas.",
      "scaleLow": "Discordo totalmente",
      "scaleHigh": "Concordo totalmente",
      "submitSurvey": "Enviar respostas",
      "submitting": "Salvando…",
      "surveyThanks": "Obrigado. Sua resposta foi registrada.",
      "textAnswerLabel": "Sua resposta",
      "checklistProgress": "{done} de {total} concluídos",
      "checklistComplete": "Todas as etapas necessárias foram concluídas.",
      "optionalTag": "opcional",
      "flipCard": "Mostrar resposta",
      "flipBack": "Mostrar pergunta",
      "cardOf": "Cartão {current} de {total}",
      "previousCard": "Cartão anterior",
      "nextCard": "Próximo cartão",
      "flashcardsDone": "Você revisou todos os cartões.",
      "emptyActivity": "Esta atividade ainda não possui conteúdo."
    }
  },
  "feedback": {
    "dialogHeading": "Enviar Feedback",
    "categoryBug": "Erro / Bug",
    "categoryErrorCrash": "Erro / Falha do Sistema",
    "categoryUnexpectedResult": "Resultado Inesperado",
    "categoryImprovementIdea": "Ideia de Melhoria",
    "categoryFieldLabel": "Categoria",
    "categoryPlaceholder": "Selecione uma categoria…",
    "notesFieldLabel": "Observações",
    "notesPlaceholder": "Descreva o que você viu ou o que esperava que acontecesse…",
    "sendingButton": "Enviando…",
    "sendButton": "Enviar",
    "successMessage": "Obrigado! Seu feedback foi recebido.",
    "submitError": "Algo deu errado — tente novamente.",
    "triggerAriaLabel": "Enviar feedback",
    "closeAriaLabel": "Fechar diálogo de feedback"
  },
  "signup": {
    "title": "Comece o teste gratuito da sua igreja",
    "subtitle": "14 dias grátis. Sem cartão de crédito. Configure cursos, convide seus professores e inscreva seus membros.",
    "churchName": "Nome da igreja ou ministério",
    "slug": "Endereço web",
    "slugHint": "Seus membros entram em {url}",
    "adminName": "Seu nome",
    "email": "Seu e-mail",
    "language": "Idioma",
    "submit": "Criar minha igreja",
    "submitting": "Enviando…",
    "sentTitle": "Verifique seu e-mail",
    "sentBody": "Enviamos um link de confirmação para {email}. Sua igreja será criada assim que você clicar nele. O link expira em 24 horas.",
    "comingSoonTitle": "Cadastro automático em breve",
    "comingSoonBody": "Deseja experimentar o ChurchCore LMS agora? Entre em contato conosco e configuraremos sua igreja.",
    "haveAccount": "Já tem uma conta?",
    "signIn": "Entrar",
    "errors": {
      "slug_taken": "Esse endereço web já está em uso. Tente outro.",
      "reserved": "Esse endereço web é reservado. Tente outro.",
      "invalid": "Verifique este campo.",
      "disposable": "Use um endereço de e-mail permanente.",
      "invalid_link": "Esse link de confirmação é inválido ou expirou. Cadastre-se novamente.",
      "failed": "Algo deu errado ao criar sua igreja. Tente novamente.",
      "generic": "Algo deu errado. Tente novamente.",
      "turnstile": "Por favor, conclua a verificação de segurança."
    }
  },
  "renew": {
    "trialEndedTitle": "O teste gratuito de {name} terminou",
    "pausedTitle": "{name} está pausada",
    "adminBody": "Escolha um plano para reativar sua igreja. Seus cursos, pessoas e progresso continuam salvos.",
    "memberBody": "O acesso da sua igreja está pausado no momento. Seu progresso está salvo. Entre em contato com o administrador da sua igreja.",
    "noPlans": "Os planos não estão disponíveis no momento. Entre em contato com o suporte da ChurchCore.",
    "choose": "Escolher plano →",
    "redirecting": "Redirecionando…",
    "checkoutError": "Não foi possível iniciar o checkout. Tente novamente.",
    "plan": {
      "starter": "Iniciante (Starter)",
      "growth": "Crescimento (Growth)",
      "enterprise": "Corporativo (Enterprise)"
    },
    "trialBanner": "Teste gratuito: {days, plural, one {# dia restante} other {# dias restantes}}.",
    "trialBannerCta": "Escolher um plano"
  },
  "welcome": {
    "title": "Sua conta ainda não está conectada a uma igreja",
    "body": "Peça à sua igreja o link de entrada ou inicie um teste gratuito para sua igreja.",
    "join": "Eu tenho um link de entrada",
    "start": "Iniciar um teste gratuito",
    "signOut": "Sair"
  }
}

fs.writeFileSync(path.join(process.cwd(), 'messages/pt.json'), JSON.stringify(pt, null, 2) + '\n', 'utf8')
console.log('Successfully generated messages/pt.json')
