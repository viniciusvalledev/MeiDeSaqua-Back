import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

class EmailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT),
      secure: true,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  private getHtmlTemplate(
    templateName: string,
    replacements: Record<string, string>,
  ): string {
    const filePath = path.join(
      __dirname,
      `../templates/emails/${templateName}.html`,
    );
    let htmlContent = fs.readFileSync(filePath, "utf-8");

    for (const [key, value] of Object.entries(replacements)) {
      htmlContent = htmlContent.split(`[${key}]`).join(value);
    }
    return htmlContent;
  }

  public async sendConfirmationEmail(to: string, token: string): Promise<void> {
    const confirmationUrl = `https://meidesaqua.saquarema.rj.gov.br/confirmar-conta?token=${token}`;
    const htmlContent = this.getHtmlTemplate("confirmacao", {
      LINK_CONFIRMACAO: confirmationUrl,
    });
    await this.transporter.sendMail({
      from: `"MeideSaquá" <${process.env.MAIL_USER}>`,
      to,
      subject: "Confirmação de Cadastro - MeideSaquá",
      html: htmlContent,
    });
  }

  public async sendPasswordResetEmail(
    to: string,
    token: string,
  ): Promise<void> {
    const resetUrl = `https://meidesaqua.saquarema.rj.gov.br/redefinir-senha?token=${token}`;
    const htmlContent = this.getHtmlTemplate("redefinir-senha", {
      LINK_REDEFINIR: resetUrl,
    });
    await this.transporter.sendMail({
      from: `"MeideSaquá" <${process.env.MAIL_USER}>`,
      to,
      subject: "Redefinição de Senha - MeideSaquá",
      html: htmlContent,
    });
  }

  public async sendEmailChangeConfirmationEmail(
    to: string,
    token: string,
  ): Promise<void> {
    const confirmationUrl = `https://meidesaqua.saquarema.rj.gov.br/confirmar-novo-email?token=${token}`;
    const htmlContent = this.getHtmlTemplate("alterar-email", {
      LINK_ALTERAR_EMAIL: confirmationUrl,
    });
    await this.transporter.sendMail({
      from: `"MeideSaquá" <${process.env.MAIL_USER}>`,
      to,
      subject: "Confirmação de Alteração de E-mail - MeideSaquá",
      html: htmlContent,
    });
  }

  // --- NOVAS FUNÇÕES PARA O ADMIN CONTROLLER ---
  public async sendEstabelecimentoApprovedEmail(
    to: string,
    nomeResponsavel: string,
    nomeFantasia: string,
    adminEdited: boolean = false,
  ): Promise<void> {
    const htmlContent = this.getHtmlTemplate("estabelecimento-aprovado", {
      NOME_RESPONSAVEL: nomeResponsavel,
      NOME_FANTASIA: nomeFantasia,
      AVISO_EDICAO: adminEdited
        ? " (com algumas edições do administrador)"
        : "",
    });
    await this.transporter.sendMail({
      from: `"MeideSaquá" <${process.env.MAIL_USER}>`,
      to,
      subject: "Seu cadastro no MeideSaquá foi Aprovado!",
      html: htmlContent,
    });
  }

  public async sendEstabelecimentoUpdateApprovedEmail(
    to: string,
    nomeResponsavel: string,
    nomeFantasia: string,
    adminEdited: boolean = false,
  ): Promise<void> {
    const htmlContent = this.getHtmlTemplate("estabelecimento-atualizado", {
      NOME_RESPONSAVEL: nomeResponsavel,
      NOME_FANTASIA: nomeFantasia,
      AVISO_EDICAO: adminEdited
        ? " (com algumas edições do administrador)"
        : "",
    });
    await this.transporter.sendMail({
      from: `"MeideSaquá" <${process.env.MAIL_USER}>`,
      to,
      subject: "Sua solicitação de atualização no MeideSaquá foi Aprovada!",
      html: htmlContent,
    });
  }

  public async sendEstabelecimentoDeletedEmail(
    to: string,
    nomeResponsavel: string,
    nomeFantasia: string,
  ): Promise<void> {
    const htmlContent = this.getHtmlTemplate("estabelecimento-excluido", {
      NOME_RESPONSAVEL: nomeResponsavel,
      NOME_FANTASIA: nomeFantasia,
    });
    await this.transporter.sendMail({
      from: `"MeideSaquá" <${process.env.MAIL_USER}>`,
      to,
      subject: "Seu estabelecimento foi removido da plataforma MeideSaquá",
      html: htmlContent,
    });
  }

  public async sendEstabelecimentoRejectedEmail(
    to: string,
    nomeResponsavel: string,
    nomeFantasia: string,
    motivo: string | undefined,
  ): Promise<void> {
    const htmlContent = this.getHtmlTemplate("estabelecimento-rejeitado", {
      NOME_RESPONSAVEL: nomeResponsavel,
      NOME_FANTASIA: nomeFantasia,
      MOTIVO_REJEICAO:
        motivo || "Para mais detalhes, entre em contato conosco.",
    });
    await this.transporter.sendMail({
      from: `"MeideSaquá" <${process.env.MAIL_USER}>`,
      to,
      subject: "Sua solicitação no MeideSaquá foi Rejeitada",
      html: htmlContent,
    });
  }

  public async sendAdminResendConfirmationEmail(
    to: string,
    token: string,
  ): Promise<void> {
    const confirmationUrl = `${process.env.FRONTEND_URL || "https://meidesaqua.saquarema.rj.gov.br"}/confirmar-conta?token=${token}`;
    const htmlContent = this.getHtmlTemplate("confirmacao", {
      LINK_CONFIRMACAO: confirmationUrl,
    });
    await this.transporter.sendMail({
      from: `"MeideSaquá" <${process.env.MAIL_USER}>`,
      to,
      subject: "Confirme sua conta no MeideSaquá (Reenvio Admin)",
      html: htmlContent,
    });
  }

  public async sendGenericEmail(options: EmailOptions): Promise<void> {
    const message = {
      from: `"MeideSaquá" <${process.env.MAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    };
    await this.transporter.sendMail(message);
  }
}

export default new EmailService();
