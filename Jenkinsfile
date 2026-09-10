pipeline {
    agent any

    environment {
        CI = 'true'
        NODE_ENV = 'test'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Repository Hygiene') {
            steps {
                sh 'bash scripts/hygiene.sh'
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Test') {
            steps {
                sh 'npm test'
            }
        }
    }

    post {
        always {
            echo 'Build and test pipeline run completed.'
        }
        success {
            echo 'Pipeline succeeded: All tests and repository hygiene checks passed.'
        }
        failure {
            echo 'Pipeline failed: Please inspect test or build logs.'
        }
    }
}
