const nodemailer = require('nodemailer');
const { transporter } = require('../config/email');

const sendActivationToken = async (email, activationToken) => {
  const info = await transporter.sendMail({
    from: 'My App <info@myapp.com>',
    to: email,
    subject: 'Account Activation',
    html: `
      <div>
      <b>Please click on the link below to activate you account</b>
      </div>
      <div>
        <a href='http://localhost:8080/#/login?token=${activationToken}'>Activate</a>
      </div>
    `,
  });

  if (process.env.NODE_ENV === 'development') {
    console.log('URL: ' + nodemailer.getTestMessageUrl(info));
  }
};

const sendPasswordResetToken = async (email, token) => {
  const info = await transporter.sendMail({
    from: 'My App <info@myapp.com>',
    to: email,
    subject: 'Password Reset',
    html: `
      <div>
      <b>Please click on the link below to reset your password</b>
      </div>
      <div>
        <a href='http://localhost:8080/#/password-reset?reset=${token}'>Reset Password</a>
      </div>
    `,
  });

  if (process.env.NODE_ENV === 'development') {
    console.log('URL: ' + nodemailer.getTestMessageUrl(info));
  }
};

module.exports = { sendActivationToken, sendPasswordResetToken };
